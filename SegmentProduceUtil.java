package com.dl.produce.biz.common.util;

import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.dl.framework.core.interceptor.expdto.BusinessServiceException;
import com.dl.produce.biz.common.constant.Const;
import com.dl.produce.biz.common.enums.SymbolE;
import com.dl.produce.biz.config.SegmentProduceConfig;
import com.dl.produce.biz.dal.visual.po.VisualDynamicNodePO;
import com.dl.produce.biz.dal.visual.po.VisualProduceJobExtendPO;
import com.dl.produce.biz.dal.visual.po.VisualProduceJobPO;
import com.dl.produce.biz.dal.visual.po.VisualProduceJobSegmentPO;
import com.dl.produce.biz.manager.cos.CosFileUploadManager;
import com.dl.produce.biz.manager.visual.VisualDynamicNodeManager;
import com.dl.produce.biz.manager.visual.VisualProduceJobManager;
import com.dl.produce.biz.manager.visual.VisualProduceJobSegmentManager;
import com.dl.produce.biz.manager.visual.dto.VisualTemplateDTO;
import com.dl.produce.biz.manager.visual.dto.preview.PreviewCardDTO;
import com.dl.produce.biz.manager.visual.dto.preview.PreviewDTO;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Page.ScreenshotOptions;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.TimeoutError;
import com.microsoft.playwright.options.ScreenshotScale;
import com.microsoft.playwright.options.ScreenshotType;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.apache.skywalking.apm.toolkit.trace.CallableWrapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.Assert;

import javax.annotation.Resource;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * @describe: SegmentProduceUtil
 * @author: zhousx
 * @date: 2023/8/1 13:55
 */
@Slf4j
@Component
public class SegmentProduceUtil {
    private static final Long LOAD_TIMEOUT = 60_000L;
    private static final Double FRAME_RATE = 24.0;
    //private static final Integer PARALLEL = Runtime.getRuntime().availableProcessors();
    private static final Integer PARALLEL_OFFSET = 12;
    private static final String BGMUSIC_FILTER = "aloop=loop=-1:size=2e+09[a1];[a1]afade=t=in:st=0:d=%s, afade=t=out:st=%s:d=%s, volume=%s";
    private static final Integer MAX_PARALLEL = 8;
    private static final Long MAX_DURATION = 600_000L;
    @Autowired
    private CosFileUploadManager cosFileUploadManager;
    @Autowired
    private VisualDynamicNodeManager visualDynamicNodeManager;
    @Autowired
    private VisualProduceJobManager visualProduceJobManager;
    @Autowired
    private VisualProduceJobSegmentManager segmentManager;
    @Resource
    private ExecutorService segmentProduceUtilExecutors;
    @Resource
    private SegmentProduceConfig segmentProduceConfig;
    @Value("${visual.player.host}")
    private String playerHost;
    @Value("${visual.produce.jobDir}")
    private String tmpDir;

    @Value("${visual.produce.cliPath}")
    private String cliPath;

    @Value("${visual.produce.chromiumPath}")
    private String chromiumPath;

    /**
     * seek超时次数阈值
     */
    @Value("${dl.segment.produce.seekovertimsthreshold}")
    private int seekOverTimeThreshold;

    /**
     * 停止标志位，若为true则该合成任务需要终止
     */
    private volatile Boolean stopFlag = Boolean.FALSE;

    /**
     * 记录seek超时次数
     */
    private static volatile AtomicInteger seekOverTimeTimes = new AtomicInteger(0);

    private static void waitForLoaded(String playUrl, Page page) throws InterruptedException {
        long begin = System.currentTimeMillis();
        String checkLoaded = "function getLoaded() {return window.datav.loaded}";
        Object loaded = page.evaluate("(" + checkLoaded + ")" + "()");
        while (Objects.isNull(loaded) || !(boolean) loaded) {
            if (System.currentTimeMillis() - begin > LOAD_TIMEOUT) {
                log.error("页面加载超时，url={}", playUrl);
                throw BusinessServiceException.getInstance("页面加载超时");
            }
            Thread.sleep(500L);
            loaded = page.evaluate("(" + checkLoaded + ")" + "()");
        }
    }

    private float getDuration(Page page) {
        String getDurationFunc = "function getDurationFunc() {return window.datav.totalDuration}";
        return new Float(page.evaluate("(" + getDurationFunc + ")" + "()").toString());
    }

    public void produce(VisualProduceJobPO job, VisualProduceJobSegmentPO segment,
            VisualProduceJobExtendPO jobExtendPO) {
        //初始化stopFlage为false
        stopFlag = Boolean.FALSE;
        //初始化seekOverTimeTimes为0
        seekOverTimeTimes.set(0);

        Long jobId = job.getJobId();
        Long templateId = job.getTemplateId();
        VisualTemplateDTO template = JSONUtil.toBean(job.getTemplateData(), VisualTemplateDTO.class);
        Assert.notNull(template, "模板不存在");
        log.info("开始进行分段合成,jobId:{},,,templateId:{}", jobId, templateId);

        // 分片数
        int segmentCount = segmentManager.lambdaQuery().eq(VisualProduceJobSegmentPO::getProduceJobId, jobId).count();

        long start = System.currentTimeMillis();
        String playUrl = playerHost + "/player/index.html?templateId=" + templateId + "&jobId=" + jobId;
        String path = tmpDir + segment.getProduceJobId();
        String resolution = getResolution(jobExtendPO, template);
        String[] resolutionArr = resolution.split("x");
        int width = Integer.parseInt(resolutionArr[0]);
        int height = Integer.parseInt(resolutionArr[1]);

        //截图的图片格式，数据图表作品截取的是PNG格式
        String imgFormat = Const.TWO.equals(jobExtendPO.getType()) ? Const.PNG : Const.JPG;
        ScreenshotType screenshotType = Const.TWO.equals(jobExtendPO.getType()) ?
                ScreenshotType.PNG :
                ScreenshotType.JPEG;
        System.setProperty("playwright.cli.dir", cliPath);
        System.setProperty("playwright.chromium.executable", chromiumPath);

        try (Playwright playwright = Playwright.create();
             Browser browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(true).setExecutablePath(Paths.get(chromiumPath))
                        .setArgs(Arrays.asList("--enable-gpu","--ignore-gpu-blacklist", "--enable-gpu-rasterization","--enable-zero-copy", "--gpu-rasterization-msaa-sample-count=16")));
             BrowserContext context = browser.newContext(
                        new Browser.NewContextOptions().setViewportSize(width, height).setDeviceScaleFactor(1));
             Page page = context.newPage()) {

            page.setDefaultTimeout(LOAD_TIMEOUT);
            page.waitForTimeout(30_000);
            page.navigate(playUrl);
            waitForLoaded(playUrl, page);

            Float duration = getDuration(page);
            if (duration.longValue() > MAX_DURATION) {
                throw BusinessServiceException.getInstance("视频时长超限");
            }
            // 总帧数
            int totalFrameNum = Math.round(duration * 24 / 1000);
            // 当前分片的帧数
            int segmentFrameNum = Objects.equals(segment.getSort(), segmentCount) ?
                    totalFrameNum - (totalFrameNum / segmentCount) * (segmentCount - 1) :
                    (totalFrameNum / segmentCount);
            // 当前分片起始帧号
            int startFrameNo = (totalFrameNum / segmentCount) * (segment.getSort() - 1);

            //创建临时目录，存放图片音频等中间产物
            File tmpDir = new File(path);
            tmpDir.mkdirs();

            int taskNum =
                    segmentFrameNum > 360 ? segmentProduceConfig.getParallel() : segmentProduceConfig.getParallel() / 2;
            taskNum = Math.min(taskNum, MAX_PARALLEL);
            Future<Boolean>[] subTasks = new Future[taskNum - 1];
            //提交截帧任务至线程池中
            for (int i = 0; i < subTasks.length; i++) {
                int ss = startFrameNo + segmentFrameNum * (i + 1) / taskNum + 1;
                int se = startFrameNo + segmentFrameNum * (i + 2) / taskNum;
                if (i < subTasks.length - 1 || segment.getSort() < segmentCount) {
                    se += PARALLEL_OFFSET;
                }
                subTasks[i] = segmentProduceUtilExecutors.submit(CallableWrapper
                        .of(new SegmentProduceUtil.ScreenShotTask(path, playUrl, startFrameNo, ss, se, width, height,
                                job, imgFormat, screenshotType)));
            }

            PreviewDTO previewDTO = JSONUtil.toBean(job.getPreviewData(), PreviewDTO.class);
            List<PreviewCardDTO.DynamicNodeDTO> nodes = previewDTO.getCards().get(0).getNodes();
            Iterator<PreviewCardDTO.DynamicNodeDTO> nodeIterator = nodes.iterator();
            PreviewCardDTO.DynamicNodeDTO node = nodeIterator.next();
            long nodeStartTime = node.getStartTime();

            for (int i = startFrameNo; i <= segmentFrameNum / taskNum + PARALLEL_OFFSET + startFrameNo; i++) {
                if (stopFlag) {
                    //需要停止合成
                    log.error("合成标志位为true，需要停止视频截帧！jobId:{}", jobId);
                    throw BusinessServiceException.getInstance("合成标志位为true，需要停止视频截帧!");
                }

                long seekTime = i * 1000 / 24;
                LocalTime seekStartTime = LocalTime.now();
                try {
                    String seekFunc = "async function invoke() {\n" + "          await window.datav.seek(" + seekTime
                            + ", true)\n" + "          return 1\n" + "        }";
                    page.waitForFunction("(" + seekFunc + ")" + "()");
                } catch (Exception e) {
                    //如果seek超时，则seekOverTimeTimes+=1
                    if (e instanceof TimeoutError) {
                        if (seekOverTimeTimes.incrementAndGet() > seekOverTimeThreshold) {
                            log.error("jobId:{},,,seek超时次数已超过阈值:{}", job.getJobId(), seekOverTimeThreshold);
                            throw BusinessServiceException.getInstance("seek超时次数已超过阈值:" + seekOverTimeThreshold);
                        }
                    }
                    try {
                        log.error("seek 异常, jobId:{},,,templateId:{},,,i:{},,,seekTime:{},准备进行一次重试,e:{}", jobId,
                                templateId, i, seekTime, e);
                        String seekFunc =
                                "async function invoke() {\n" + "          await window.datav.seek(" + seekTime
                                        + ", true)\n" + "          return 1\n" + "        }";
                        log.info("准备进行seek重试,jobId:{},,,i:{},,,seekTime:{}", jobId, i, seekTime);
                        page.waitForFunction("(" + seekFunc + ")" + "()");
                        log.info("seek重试完成,jobId:{},,,i:{},,,seekTime:{}", jobId, i, seekTime);
                    } catch (Exception e2) {
                        //记录日志，并继续往外抛
                        log.error("seek 重试异常, jobId:{},,,templateId:{},,,i:{},,,seekTime:{},e2:{}", jobId, templateId,
                                i, seekTime, e2);
                        throw BusinessServiceException.getInstance("seek异常!jobId=" + jobId);
                    }

                }
                if (i - startFrameNo < PARALLEL_OFFSET && !Const.ONE.equals(segment.getSort())) {
                    continue;
                }

                //若已有封面，则将封面存为第0帧
                if (i == 0 && StringUtils.isNotBlank(job.getCoverUrl()) && Objects
                        .equals(segment.getSort(), Const.ONE)) {
                    DownloadUtil.downloadFile(job.getCoverUrl(), path + "/screenshot0." + imgFormat);
                    continue;
                }

                LocalTime screenshotStartTime = LocalTime.now();
                ScreenshotOptions options = new Page.ScreenshotOptions().setType(screenshotType)
                        .setScale(ScreenshotScale.CSS).setFullPage(true);
                if (ScreenshotType.JPEG.equals(screenshotType)) {
                    options.setQuality(80);
                }
                if (ScreenshotType.PNG.equals(screenshotType)) {
                    options.setOmitBackground(true);
                }
                byte[] screenshot = page.screenshot(options);
                Path screenshotPath = Paths.get(path + "/screenshot" + i + SymbolE.DOT.getValue() + imgFormat);
                Files.write(screenshotPath, screenshot);
                LocalTime endTime = LocalTime.now();
                log.info("jobId:{},,,,第" + i + "次,seek的时间点:{}, seek耗时={},截图耗时={} ", jobId, seekTime,
                        Duration.between(seekStartTime, screenshotStartTime).toMillis(),
                        Duration.between(screenshotStartTime, endTime).toMillis());
                if (seekTime > nodeStartTime) {
                    String clipCoverUrl = cosFileUploadManager.uploadFile(screenshotPath.toFile(), null, null,
                            node.getNodeId() + SymbolE.DOT.getValue() + imgFormat);
                    visualDynamicNodeManager.lambdaUpdate().eq(VisualDynamicNodePO::getNodeId, node.getNodeId())
                            .eq(VisualDynamicNodePO::getTemplateId, templateId)
                            .set(VisualDynamicNodePO::getCoverUrl, clipCoverUrl)
                            .set(VisualDynamicNodePO::getModifyDt, new Date()).update();
                    if (nodeIterator.hasNext()) {
                        node = nodeIterator.next();
                        nodeStartTime = node.getStartTime();
                    } else {
                        nodeStartTime = Long.MAX_VALUE;
                    }
                }
            }

            for (int i = 0; i < subTasks.length; i++) {
                try {
                    subTasks[i].get();
                } catch (ExecutionException e) {
                    Throwable throwable = e.getCause();
                    log.error("线程池截帧时发生异常!jobId:{},,,e:", jobId, e);
                    if (throwable instanceof BusinessServiceException) {
                        throw (BusinessServiceException) throwable;
                    }
                    throw BusinessServiceException.getInstance("线程池截帧时发生异常");
                } catch (Exception e) {
                    throw BusinessServiceException.getInstance("");
                }
            }
            log.error("jobId:{},,,,截屏总耗时={}毫秒", jobId, System.currentTimeMillis() - start);

            if(Objects.equals(segment.getSort(), Const.ONE)) {
                // 设置时长
                LambdaUpdateWrapper<VisualProduceJobPO> updateWrapper = Wrappers.lambdaUpdate(VisualProduceJobPO.class)
                        .eq(VisualProduceJobPO::getJobId, job.getJobId())
                        .set(VisualProduceJobPO::getDuration, duration.longValue())
                        .set(VisualProduceJobPO::getModifyDt, new Date());
                if (StringUtils.isBlank(job.getCoverUrl())) {
                    // 视频封面 时长超过1s则用第24帧，不慢1s则用第0帧
                    File coverImg = duration > 1_000 ?
                            new File(path + "/screenshot24." + imgFormat) :
                            new File(path + "/screenshot0." + imgFormat);
                    String coverUrl = cosFileUploadManager
                            .uploadFile(coverImg, null, null, jobId + SymbolE.DOT.getValue() + imgFormat);
                    updateWrapper.set(VisualProduceJobPO::getCoverUrl, coverUrl);
                }
                //更新
                visualProduceJobManager.update(updateWrapper);
            }
        } catch (Exception e) {
            log.error("视频合成异常,jobId:{}, playUrl:{},,,e:{}", jobId, playUrl, e);
            stopFlag = Boolean.TRUE;
            throw BusinessServiceException.getInstance(e.getMessage());
        }
    }

    class ScreenShotTask implements Callable<Boolean> {
        private String path;
        private String url;
        private Integer startFrameNo;
        private Integer start;
        private Integer end;
        private Integer width;
        private Integer height;
        private VisualProduceJobPO job;
        private String imgFormat;
        private ScreenshotType screenshotType;

        public ScreenShotTask(String path, String url, Integer startFrameNo, Integer start, Integer end, Integer width,
                Integer height, VisualProduceJobPO job, String imgFormat, ScreenshotType screenshotType) {
            this.path = path;
            this.url = url;
            this.startFrameNo = startFrameNo;
            this.start = start;
            this.end = end;
            this.width = width;
            this.height = height;
            this.job = job;
            this.imgFormat = imgFormat;
            this.screenshotType = screenshotType;
        }

        @Override
        public Boolean call() {
            System.setProperty("playwright.cli.dir", cliPath);
            System.setProperty("playwright.chromium.executable", chromiumPath);

            try (Playwright playwright = Playwright.create();
                    Browser browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(true).setExecutablePath(Paths.get(chromiumPath))
                            .setArgs(Arrays.asList("--enable-gpu","--ignore-gpu-blacklist", "--enable-gpu-rasterization","--enable-zero-copy", "--gpu-rasterization-msaa-sample-count=16")));
                    BrowserContext context = browser.newContext(
                            new Browser.NewContextOptions().setViewportSize(width, height).setDeviceScaleFactor(1));
                    Page page = context.newPage()) {

                page.setDefaultTimeout(LOAD_TIMEOUT);
                page.waitForTimeout(30_000);
                page.navigate(url);
                waitForLoaded(url, page);

                PreviewDTO previewDTO = JSONUtil.toBean(job.getPreviewData(), PreviewDTO.class);
                List<PreviewCardDTO.DynamicNodeDTO> nodes = previewDTO.getCards().get(0).getNodes();
                Iterator<PreviewCardDTO.DynamicNodeDTO> nodeIterator = nodes.iterator();
                long startSeekTime = start * 1000 / 24;
                PreviewCardDTO.DynamicNodeDTO node = null;
                long nodeStartTime = Long.MAX_VALUE;
                while(nodeIterator.hasNext()) {
                    node = nodeIterator.next();
                    nodeStartTime = node.getStartTime();
                    if(nodeStartTime > startSeekTime) {
                        break;
                    }
                }

                // 截图
                for (int i = start; i <= end; i++) {
                    if (stopFlag) {
                        //需要停止合成
                        log.error("合成标志位为true，需要停止视频截帧！jobId:{}", job.getJobId());
                        throw BusinessServiceException.getInstance("合成标志位为true，需要停止视频截帧!");
                    }

                    long seekTime = i * 1000 / 24;
                    LocalTime seekStartTime = LocalTime.now();
                    try {
                        String seekFunc =
                                "async function invoke() {\n" + "          await window.datav.seek(" + seekTime
                                        + ", true)\n" + "          return 1\n" + "        }";
                        page.waitForFunction("(" + seekFunc + ")" + "()");
                    } catch (Exception e) {
                        //如果seek超时，则seekOverTimeTimes+=1
                        if (e instanceof TimeoutError) {
                            if (seekOverTimeTimes.incrementAndGet() > seekOverTimeThreshold) {
                                log.error("jobId:{},,,seek超时次数已超过阈值:{}", job.getJobId(), seekOverTimeThreshold);
                                throw BusinessServiceException.getInstance("seek超时次数已超过阈值:" + seekOverTimeThreshold);
                            }
                        }
                        try {
                            log.error("call中seek 异常, jobId:{},,,templateId:{},,,seekTime:{}", job.getJobId(),
                                    job.getTemplateId(), seekTime, e);
                            String seekFunc =
                                    "async function invoke() {\n" + "          await window.datav.seek(" + seekTime
                                            + ", true)\n" + "          return 1\n" + "        }";
                            log.info("准备进行seek重试,jobId:{},,,i:{},,,seekTime:{}", job.getJobId(), i, seekTime);
                            page.waitForFunction("(" + seekFunc + ")" + "()");
                            log.info("seek重试完成,jobId:{},,,i:{},,,seekTime:{}", job.getJobId(), i, seekTime);
                        } catch (Exception e2) {
                            //记录日志，并继续往外抛
                            log.error("seek 重试异常, jobId:{},,,templateId:{},,,seekTime:{},,,e2:{}", job.getJobId(),
                                    job.getTemplateId(), seekTime, e2);
                            throw BusinessServiceException.getInstance("seek发生异常!" + e2);
                        }
                    }

                    if (i - start < PARALLEL_OFFSET) {
                        continue;
                    }
                    LocalTime screenshotStartTime = LocalTime.now();
                    ScreenshotOptions options = new Page.ScreenshotOptions().setType(screenshotType)
                            .setScale(ScreenshotScale.CSS).setFullPage(true);
                    if (ScreenshotType.JPEG.equals(screenshotType)) {
                        options.setQuality(80);
                    }
                    if (ScreenshotType.PNG.equals(screenshotType)) {
                        options.setOmitBackground(true);
                    }
                    byte[] screenshot = page.screenshot(options);
                    Path screenshotPath = Paths.get(path + "/screenshot" + i + SymbolE.DOT.getValue() + imgFormat);
                    Files.write(screenshotPath, screenshot);
                    LocalTime endTime = LocalTime.now();
                    log.info("jobId:{},,,第" + i + "次,seek的时间点:{}, seek耗时={},截图耗时={} ", job.getJobId(), seekTime,
                            Duration.between(seekStartTime, screenshotStartTime).toMillis(),
                            Duration.between(screenshotStartTime, endTime).toMillis());
                    if (seekTime > nodeStartTime) {
                        String clipCoverUrl = cosFileUploadManager.uploadFile(screenshotPath.toFile(), null, null,
                                node.getNodeId() + SymbolE.DOT.getValue() + imgFormat);
                        visualDynamicNodeManager.lambdaUpdate().eq(VisualDynamicNodePO::getNodeId, node.getNodeId())
                                .eq(VisualDynamicNodePO::getTemplateId, job.getTemplateId())
                                .set(VisualDynamicNodePO::getCoverUrl, clipCoverUrl)
                                .set(VisualDynamicNodePO::getModifyDt, new Date()).update();
                        if (nodeIterator.hasNext()) {
                            node = nodeIterator.next();
                            nodeStartTime = node.getStartTime();
                        } else {
                            nodeStartTime = Long.MAX_VALUE;
                        }
                    }
                }
            } catch (Exception e) {
                log.error("截屏发生异常！jobId:{}", job.getJobId(), e);
                stopFlag = Boolean.TRUE;
                throw BusinessServiceException.getInstance(e.getMessage());
            }
            return Boolean.TRUE;
        }
    }

    @Data
    public static class ProduceResult {
        private String videoUrl;

        private Long size;
    }

    private static String getResolution(VisualProduceJobExtendPO jobExtendPO, VisualTemplateDTO template) {
        if (Objects.isNull(jobExtendPO)) {
            return template.getResolution();
        }
        if (Objects.isNull(jobExtendPO.getResolution())) {
            return template.getResolution();
        }
        return jobExtendPO.getResolution();
    }

}
