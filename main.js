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

rimrafSync(path.resolve('./output/images/*.jpg'), { glob: true })
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
// (async () => {
//     // Launch the browser
//     const browser = await puppeteer.launch({
//         headless: true,
//         args: ['--disk-cache'],
//     });
//
//     // Create a page
//     const page = await browser.newPage();
//
//     await page.setViewport({width: 1920, height: 1080});
//
//     const start = Date.now();
//     // Go to your site
//     await page.goto('https://magictest.dinglitec.com/player/index.html?templateId=1163717567884958434&jobId=1163717664528772332');
//
//
//     let totalSeekCost = 0;
//     let totalSaveImgCost = 0;
//     // log(chalk.green, 'wait for loaded')
//     const spinner = ora('wait for loaded').start();
//     const watchLoaded = page.waitForFunction('window.datav.loaded === true');
//     spinner.succeed('Successfully loaded!');
//
//     async function seek(timestamp) {
//         log(chalk.green, '截帧时间点', timestamp, 'ms')
//         const spinner = ora('wait for loaded').start();
//         let start = Date.now();
//         await page.waitForFunction(`(async function() {await window.datav.seek(${timestamp}, true);return 1})()`)
//         spinner.succeed('Successfully seeked');
//         const seekCost = Date.now() - start;
//         totalSeekCost += seekCost;
//         log(chalk.yellow, '截帧耗时', seekCost, 'ms')
//     }
//
//     try {
//         await Promise.race([
//             new Promise((resolve, reject) => setTimeout(() => reject('timeout'), 10000)),
//             watchLoaded,
//         ])
//
//         const totalDuration = await page.evaluate('window.datav.totalDuration');
//         log(chalk.blue, '视频总时长', totalDuration, 'ms')
//
//         let startTimestamp = 0;
//         let index = 0;
//         while (startTimestamp !== totalDuration) {
//             await seek(startTimestamp);
//             let start = Date.now();
//             await page.screenshot({
//                 path: `./output/images/screenshot${index}.jpg`,
//                 encoding: 'binary',
//                 type: 'jpeg',
//                 quality: 80,
//                 // fromSurface: true,
//                 optimizeForSpeed: true,
//             });
//             const saveImgCost = Date.now() - start;
//             totalSaveImgCost += saveImgCost;
//             log(chalk.yellow, '保存图片耗时', saveImgCost, 'ms')
//             startTimestamp += (1000 / 24);
//             index++;
//             if (startTimestamp > totalDuration) {
//                 startTimestamp = totalDuration;
//             }
//         }
//
//         const totalCost = Date.now() - start;
//         log(chalk.blue, '视频合成总耗时', totalCost, 'ms')
//         log(chalk.blue, '视频合成比', `1:${(totalCost / totalDuration).toFixed(2)}`)
//         log(chalk.blue, '- 截帧总耗时', totalSeekCost, 'ms')
//     } finally {
//         // Close browser.
//         await browser.close();
//     }
// })();