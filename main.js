// Import puppeteer
// import chalk from "chalk";
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
// const chalk = require("chalk");
// const puppeteer = require('puppeteer');
// const ora = require("ora");
// const ffmpeg = require('fluent-ffmpeg');
// const ff = require('@ffmpeg-installer/ffmpeg');

function log(chalkFunc, ...args) {
    console.log(chalkFunc(...args));
}
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
// ffmpeg原始命令合成mp4视频的完整命令:sudo /usr/local/ffmpeg/bin/ffmpeg -framerate 24 -i /root/produce/jobs/1163724540770900017/screenshot%d.jpg -vf scale=1920:1080 -c:v libx264 -b:v 2000k -preset medium /root/produce/jobs/1163724540770900017/1163724540770900017.mp4
// _ffmpeg()

rimrafSync(slash(path.resolve('./output/images/*.jpg')), { glob: true });
// ffmpeg()
//     .input(path.resolve('./output/images/screenshot%d.jpg'))
//     .output(path.resolve('./output/videos/video.mp4'))
//     .outputOptions([
//         '-framerate 24',
//         '-vf scale=1920:1080',
//         '-c:v libx264',
//         '-b:v 2000k',
//         '-preset medium'
//     ])
//     .on('error', function (err) {
//         log(chalk.red, 'An error occurred: ' + err.message);
//     })
//     .on('start', function (commandLine) {
//         log(chalk.green, 'Spawned Ffmpeg with command: ' + commandLine);
//     })
//     .on('progress', function (progress) {
//         log(chalk.green, 'Processing: ' + progress.percent + '% done');
//     })
//     .on('end', function () {
//         log(chalk.green, 'Finished processing');
//     })
//     .run()
// // ffmpeg.setFfmpegPath('C:\\Users\\ASUS\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-7.0-full_build\\bin')
// // ffmpeg
//
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

    // Go to your site
    // await page.goto('https://magictest.dinglitec.com/player/index.html?templateId=1163717567884958434&jobId=1163717664528772332'); // 数字人
    await page.goto('https://magictest.dinglitec.com/player/index.html?templateId=1163725541149476826&jobId=1163725551097317338'); // MP4
    // await page.goto('https://magictest.dinglitec.com/player/index.html?templateId=1163725551102560218&jobId=1163725552429008858'); // 图表、花字、文本、贴图
    const browserCost = Date.now() - browserStart;

    // await new Promise((resolve) => setTimeout(resolve, 1000000))

    let totalSeekCost = 0;
    let totalScreenshotCost = 0;
    let totalSaveImgCost = 0;
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
        totalSeekCost += seekCost;
        log(chalk.yellow, 'seek 耗时', seekCost, 'ms')
    }

    try {
        await Promise.race([
            new Promise((resolve, reject) => setTimeout(() => reject('timeout'), 10000)),
            watchLoaded,
        ])
        const loadCost = Date.now() - loadStart;
        spinner.succeed('Successfully loaded!');

        const totalDuration = await page.evaluate('window.datav.totalDuration');
        log(chalk.blue, '视频总时长', totalDuration, 'ms')

        let startTimestamp = 0;
        let index = 0;
        while (startTimestamp !== totalDuration) {
            await seek(startTimestamp);
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
            log(chalk.yellow, 'screenshot 耗时', screenshotCost, 'ms')

            const saveImgStart = Date.now();
            await writeFile(path.resolve(`./output/images/screenshot${index}.jpg`), data)
            const saveImgCost = Date.now() - saveImgStart;
            totalSaveImgCost += saveImgCost;
            log(chalk.yellow, 'saveImg 耗时', saveImgCost, 'ms')


            startTimestamp += (1000 / 24);
            index++;
            if (startTimestamp > totalDuration) {
                startTimestamp = totalDuration;
            }
        }

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
            log(chalk.blue, '- 打开浏览器 & 进入页面耗时', browserCost, 'ms')
            log(chalk.blue, '- 打开浏览器 & 进入页面耗时占比', (browserCost / totalCost * 100).toFixed(2), '%')
            log(chalk.blue, '- load 总耗时', loadCost, 'ms')
            log(chalk.blue, '- load 耗时占比', (loadCost / totalCost * 100).toFixed(2), '%')
            log(chalk.blue, '- seek 总耗时', totalSeekCost, 'ms')
            log(chalk.blue, '- seek 耗时占比', (totalSeekCost / totalCost * 100).toFixed(2), '%')
            log(chalk.blue, '- screenshot 总耗时', totalScreenshotCost, 'ms')
            log(chalk.blue, '- screenshot 耗时占比', (totalScreenshotCost / totalCost * 100).toFixed(2), '%')
            log(chalk.blue, '- saveImg 总耗时', totalSaveImgCost, 'ms')
            log(chalk.blue, '- saveImg 耗时占比', (totalSaveImgCost / totalCost * 100).toFixed(2), '%')
            log(chalk.blue, '- ffmpeg 合成视频总耗时', ffmpegCost, 'ms')
            log(chalk.blue, '- ffmpeg 合成视频耗时占比', (ffmpegCost / totalCost * 100).toFixed(2), '%')
        })
        .run()
    } finally {
        // Close browser.
        await browser.close();
    }
})();