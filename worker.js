import { parentPort } from 'worker_threads'
import chalk from "chalk";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
function log(chalkFunc, ...args) {
    console.log(chalkFunc(...args));
}

parentPort.on('message', async (data) => {
    // const result = calculateFibonacci(n);
    const {
        url,
        count,
        fps,
        startTime,
        index: threadIndex,
        wsEndpoint,
    } = data;
    // parentPort.postMessage(n);
    let totalSeekCost = 0;
    async function seek(timestamp) {
        log(chalk.green, '截帧时间点', timestamp, 'ms')
        // const spinner = ora('wait for loaded').start();
        let start = Date.now();
        await page.waitForFunction(`(async function() {await window.datav.seek(${timestamp}, true);return 1})()`)
        // spinner.succeed('Successfully seeked');
        const seekCost = Date.now() - start;
        totalSeekCost += seekCost;
        log(chalk.yellow, 'seek 耗时', seekCost, 'ms')
    }

    // const start = Date.now();
    const browserStart = Date.now();
    // Launch the browser
    // const browser = await puppeteer.connect({
    //     browserWSEndpoint: wsEndpoint
    // })
    const browser = await puppeteer.launch({
        headless: true,
        // headless: false,
        // defaultViewport: { width: 1920, height: 1080},
        args: [
            '--disk-cache',
            "--enable-gpu",
            "--ignore-gpu-blacklist",
            "--enable-gpu-rasterization",
            "--enable-zero-copy",
            "--gpu-rasterization-msaa-sample-count=16",
            '--enable-gpu-memory-buffer-video-frames',
            '--enable-native-gpu-memory-buffers',
            '--video-capture-use-gpu-memory-buffer',
            '--video-threads=14',

            // '--use-cmd-decoder=passthrough',
            // '--enable-features=CanvasOopRasterization,VaapiVideoDecoder,UseChromeOSDirectVideoDecoder,VaapiIgnoreDriverChecks,PlatformHEVCDecoderSupport,Vulkan,DefaultANGLEVulkan,VulkanFromANGLE',
            // '--use-gl=angle',
            // '--use-angle=vulkan',
            // '--use-vulkan=native',
            // '--ozone-platform=x11',

            // '--disable-features=UseOzonePlatform',
        ],
    });

    // Create a page
    const page = await browser.newPage();

    await page.setViewport({width: 1920, height: 1080});

    // Go to your site
    // await page.goto('https://magictest.dinglitec.com/player/index.html?templateId=1163717567884958434&jobId=1163717664528772332'); // 数字人
    await page.goto(url);
    // await page.goto('https://magictest.dinglitec.com/player/index.html?templateId=1163725551102560218&jobId=1163725552429008858'); // 图表、花字、文本、贴图
    const browserCost = Date.now() - browserStart;


    let loadStart = Date.now();
    const watchLoaded = page.waitForFunction('window.datav.loaded === true' + (threadIndex === 0 ? ' && window.datav.firstFrameLoaded === true' : ''));

    await Promise.race([
        new Promise((resolve, reject) => setTimeout(() => reject('timeout'), 10000)),
        watchLoaded,
    ])
    const loadCost = Date.now() - loadStart;


    let totalScreenshotCost = 0;
    let totalSaveImgCost = 0;
    let index = 0;
    while (index !== count) {
        await seek(startTime + (1000 / fps) * index);
        const start = Date.now();
        const data = await page.screenshot({
            // path: `./output/images/screenshot${index}.jpg`,
            encoding: 'binary',
            type: 'jpeg',
            quality: 80,
            // fromSurface: true,
            // optimizeForSpeed: true,
        });
        const screenshotCost = Date.now() - start;
        totalScreenshotCost += screenshotCost;
        log(chalk.yellow, `线程：${threadIndex}，screenshot 耗时`, screenshotCost, 'ms')

        const saveImgStart = Date.now();
        await writeFile(path.resolve(`./output/images/screenshot${(threadIndex * count) + index}.jpg`), data)
        const saveImgCost = Date.now() - saveImgStart;
        totalSaveImgCost += saveImgCost;
        log(chalk.yellow, `线程：${threadIndex}，saveImg 耗时`, saveImgCost, 'ms')


        index++;
        // if (startTimestamp > totalDuration) {
        //     startTimestamp = totalDuration;
        // }
    }

    parentPort.postMessage({
        type: 'success',
        data: {
            browserCost,
            totalSeekCost,
            totalScreenshotCost,
            totalSaveImgCost,
            loadCost,
            threadIndex,
        }
    });
});