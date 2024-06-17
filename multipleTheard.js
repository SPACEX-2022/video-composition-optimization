// const { Worker, isMainThread, parentPort } = require('worker_threads');
import { Worker, isMainThread, parentPort } from 'worker_threads'
import chalk from "chalk";
import puppeteer from "puppeteer";
import ora from "ora";
import { rimrafSync } from 'rimraf';
import * as _ffmpeg from 'fluent-ffmpeg';
import ff from '@ffmpeg-installer/ffmpeg';
import * as child_process from "node:child_process";
import * as path from "node:path";
import * as url from "node:url";
import slash from 'slash';
import * as fse from "fs-extra";
import { writeFile } from 'node:fs/promises';

const ffmpeg = _ffmpeg.default;
const numThreads = 4; // 四个工作线程
const FPS = 24;

// if (isMainThread) {
//     const worker = new Worker('./worker.js');
//     // 主线程的逻辑
// } else {
//     // 工作线程的逻辑
//     parentPort.postMessage('来自工作线程的问候');
// }
function log(chalkFunc, ...args) {
    console.log(chalkFunc(...args));
}

rimrafSync(slash(path.resolve('./output/images/*.jpg')), { glob: true });

(async () => {
    const start = Date.now();
    const browserStart = Date.now();
    // Launch the browser
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

    // const url = 'https://magictest.dinglitec.com/player/index.html?templateId=1163725541149476826&jobId=1163725551097317338' // MP4
    const url = 'https://dingshu.dinglitec.com/player/index.html?templateId=1190752389781719068&jobId=1190752390033377308&open_in_browser=true' // 性能压测模板
    // Go to your site
    // await page.goto('https://magictest.dinglitec.com/player/index.html?templateId=1163717567884958434&jobId=1163717664528772332'); // 数字人
    await page.goto(url);
    // await page.goto('https://magictest.dinglitec.com/player/index.html?templateId=1163725551102560218&jobId=1163725552429008858'); // 图表、花字、文本、贴图
    let gBrowserCost = Date.now() - browserStart;

    const wsEndpoint = browser.wsEndpoint();

    // await new Promise((resolve) => setTimeout(resolve, 1000000))

    let gTotalSeekCost = 0;
    let gTotalScreenshotCost = 0;
    let gTotalSaveImgCost = 0;
    // log(chalk.green, 'wait for loaded')
    const spinner = ora('wait for loaded').start();
    let loadStart = Date.now();
    const watchLoaded = page.waitForFunction('window.datav.loaded === true && window.datav.firstFrameLoaded === true');

    async function seek(timestamp) {
        log(chalk.green, '截帧时间点', timestamp, 'ms')
        // const spinner = ora('wait for loaded').start();
        let start = Date.now();
        await page.waitForFunction(`(async function() {await window.datav.seek(${timestamp}, true);return 1})()`)
        // spinner.succeed('Successfully seeked');
        const seekCost = Date.now() - start;
        gTotalSeekCost += seekCost;
        log(chalk.yellow, 'seek 耗时', seekCost, 'ms')
    }

    try {
        await Promise.race([
            new Promise((resolve, reject) => setTimeout(() => reject('timeout'), 10000)),
            watchLoaded,
        ])
        const gLoadCost = Date.now() - loadStart;
        spinner.succeed('Successfully loaded!');

        const totalDuration = await page.evaluate('window.datav.totalDuration');
        log(chalk.blue, '视频总时长', totalDuration, 'ms')

        let startTimestamp = 0;

        const averageDuration = totalDuration / numThreads;

        const promiseList = [];

        for (let i = 0; i < numThreads; i++) {
            promiseList.push(new Promise((resolve, reject) => {
                const worker = new Worker('./worker.js');

                worker.on('message', (result) => {
                    console.log(`message：${result}`);
                    const {
                        type,
                        data,
                    } = result;
                    if (type === 'success') {
                        resolve(data);
                    } else {
                        reject(data);
                    }
                });

                // worker.on('success', (result) => {
                //     console.log(result);
                //     resolve(result);
                // });
                //
                // worker.on('error', (result) => {
                //     log(chalk.red, 'error', result)
                //     reject(result)
                // });

                worker.postMessage({
                    url,
                    count: Math.floor(averageDuration / (1000 / FPS)),
                    fps: FPS,
                    startTime: i * averageDuration,
                    index: i,
                    wsEndpoint,
                });
                // startTimestamp += averageDuration;
            }))
        }

        const resultList = await Promise.all(promiseList)

        resultList.forEach((result) => {
            const {
                browserCost,
                totalSeekCost,
                totalScreenshotCost,
                totalSaveImgCost,
                loadCost,
                threadIndex,
            } = result;
            log(chalk.blue, `线程 ${threadIndex} 启动浏览器耗时`, browserCost, 'ms')
            log(chalk.blue, `线程 ${threadIndex} 加载页面耗时`, loadCost, 'ms')
            log(chalk.blue, `线程 ${threadIndex} seek 耗时`, totalSeekCost, 'ms')
            log(chalk.blue, `线程 ${threadIndex} 截图耗时`, totalScreenshotCost, 'ms')
            log(chalk.blue, `线程 ${threadIndex} 保存图片耗时`, totalSaveImgCost, 'ms')
            log(chalk.blue, `线程 ${threadIndex} 总耗时`, browserCost + loadCost + totalScreenshotCost + totalSaveImgCost, 'ms')

            gBrowserCost += browserCost;
            gTotalScreenshotCost += totalScreenshotCost;
            gTotalSeekCost += totalSeekCost;
            gTotalSaveImgCost += totalSaveImgCost;
        })


        const ffmpegStart = Date.now();
        ffmpeg()
            .input(path.resolve('./output/images/screenshot%d.jpg'))
            .output(path.resolve('./output/videos/video.mp4'))
            .outputOptions([
                '-framerate 24',
                '-vf scale=1920:1080',
                '-c:v libx264',
                '-b:v 2000k',
                '-preset medium'
            ])
            .on('error', function (err) {
                log(chalk.red, 'An error occurred: ' + err.message);
            })
            .on('start', function (commandLine) {
                log(chalk.green, 'Spawned Ffmpeg with command: ' + commandLine);
            })
            .on('progress', function (progress) {
                log(chalk.green, 'Processing: ' + progress.percent + '% done');
            })
            .on('end', function () {
                log(chalk.green, 'Finished processing');




                const totalCost = Date.now() - start;
                const ffmpegCost = Date.now() - ffmpegStart;

                log(chalk.blue, '视频合成总耗时', totalCost, 'ms')
                log(chalk.blue, '视频合成比', `1:${(totalCost / totalDuration).toFixed(2)}`)
                log(chalk.blue, '- 打开浏览器 & 进入页面耗时', gBrowserCost, 'ms')
                log(chalk.blue, '- 打开浏览器 & 进入页面耗时占比', (gBrowserCost / totalCost * 100).toFixed(2), '%')
                log(chalk.blue, '- load 总耗时', gLoadCost, 'ms')
                log(chalk.blue, '- load 耗时占比', (gLoadCost / totalCost * 100).toFixed(2), '%')
                log(chalk.blue, '- seek 总耗时', gTotalSeekCost, 'ms')
                log(chalk.blue, '- seek 耗时占比', (gTotalSeekCost / totalCost * 100).toFixed(2), '%')
                log(chalk.blue, '- screenshot 总耗时', gTotalScreenshotCost, 'ms')
                log(chalk.blue, '- screenshot 耗时占比', (gTotalScreenshotCost / totalCost * 100).toFixed(2), '%')
                log(chalk.blue, '- saveImg 总耗时', gTotalSaveImgCost, 'ms')
                log(chalk.blue, '- saveImg 耗时占比', (gTotalSaveImgCost / totalCost * 100).toFixed(2), '%')
                log(chalk.blue, '- ffmpeg 合成视频总耗时', ffmpegCost, 'ms')
                log(chalk.blue, '- ffmpeg 合成视频耗时占比', (ffmpegCost / totalCost * 100).toFixed(2), '%')
            })
            .run()
    } finally {
        // Close browser.
        await browser.close();
    }
})();