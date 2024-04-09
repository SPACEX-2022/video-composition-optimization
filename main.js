// Import puppeteer
import puppeteer from 'puppeteer';
import chalk from "chalk";
import ora from "ora";

function log(chalkFunc, ...args) {
    console.log(chalkFunc(...args));
}

(async () => {
    // Launch the browser
    const browser = await puppeteer.launch({
        args: ['--disk-cache'],
    });

    // Create a page
    const page = await browser.newPage();

    await page.setViewport({width: 1920, height: 1080});

    const start = Date.now();
    // Go to your site
    await page.goto('https://magictest.dinglitec.com/player/index.html?templateId=1163717567884958434&jobId=1163717664528772332');


    let totalSeekCost = 0;
    let totalSaveImgCost = 0;
    // log(chalk.green, 'wait for loaded')
    const spinner = ora('wait for loaded').start();
    const watchLoaded = page.waitForFunction('window.datav.loaded === true');
    spinner.succeed('Successfully loaded!');

    async function seek(timestamp) {
        log(chalk.green, '截帧时间点', timestamp, 'ms')
        const spinner = ora('wait for loaded').start();
        let start = Date.now();
        await page.waitForFunction(`(async function() {await window.datav.seek(${timestamp}, true);return 1})()`)
        spinner.succeed('Successfully seeked');
        const seekCost = Date.now() - start;
        totalSeekCost += seekCost;
        log(chalk.yellow, '截帧耗时', seekCost, 'ms')
    }

    try {
        await Promise.race([
            new Promise((resolve, reject) => setTimeout(() => reject('timeout'), 10000)),
            watchLoaded,
        ])

        const totalDuration = await page.evaluate('window.datav.totalDuration');
        log(chalk.blue, '视频总时长', totalDuration, 'ms')

        let startTimestamp = 0;
        while (startTimestamp !== totalDuration) {
            await seek(startTimestamp);
            let start = Date.now();
            await page.screenshot({path: `./output/images/${startTimestamp}.png`});
            const saveImgCost = Date.now() - start;
            totalSaveImgCost += saveImgCost;
            log(chalk.yellow, '保存图片耗时', saveImgCost, 'ms')
            startTimestamp += 40;
            if (startTimestamp > totalDuration) {
                startTimestamp = totalDuration;
            }
        }

        log(chalk.blue, '视频合成总耗时', Date.now() - start, 'ms')
        log(chalk.blue, '- 截帧总耗时', totalSeekCost, 'ms')

    } finally {
        // Close browser.
        await browser.close();
    }
})();