import puppeteer from "puppeteer";

(async () => {
    // Launch the browser
    const browser = await puppeteer.launch({
        headless: true,
        // headless: false,
        // defaultViewport: { width: 1920, height: 1080},
        args: [
            '--no-sandbox',
            '--disk-cache',
            "--enable-gpu",
            "--ignore-gpu-blacklist",
            "--enable-gpu-rasterization",
            "--enable-zero-copy",
            "--gpu-rasterization-msaa-sample-count=16",
            '--enable-gpu-memory-buffer-video-frames',
            '--enable-native-gpu-memory-buffers',
            '--video-capture-use-gpu-memory-buffer',
            // '--enable-features=VaapiVideoDecoder',
            // '--enable-features=VaapiVideoDecode',
            // '--enable-features=D3D11VideoDecoder,DirectCompositionUseNV12DecoderSwapChain',
            // '--enable-gpu-appcontainer',
            // '--enable-features=VaapiVideoDecodeLinuxGL',
            // '--enable-features=VaapiOnNvidiaGPUs',
            // '--add-gpu-appcontainer-caps=lpacMedia',
            // '--use-gl=angle',
            // '--use-angle=gl',
            // '--hardware-video-decode-framerate',
            '--video-threads=14',

            // '--use-cmd-decoder=passthrough',
            // '--enable-features=CanvasOopRasterization,VaapiVideoDecoder,UseChromeOSDirectVideoDecoder,VaapiIgnoreDriverChecks,PlatformHEVCDecoderSupport,Vulkan,DefaultANGLEVulkan,VulkanFromANGLE',
            // '--use-gl=angle',
            // '--use-angle=vulkan',
            // '--use-vulkan=native',
            // '--ozone-platform=x11',

            // '--disable-features=UseOzonePlatform',

            // '--remote-debugging-port=9222',
            // '--remote-debugging-address=0.0.0.0',
        ],
    });

    // Create a page
    const page = await browser.newPage();

    // await page.setViewport({width: 1920, height: 1080});

    // Go to your site
    await page.goto('chrome://gpu');

    // await page.pdf({
    //     format: "A4",
    //     printBackground: true,
    //     path: "./pdf.pdf",
    //     displayHeaderFooter: true,
    //     margin: {
    //         top: "80px",
    //         bottom: "80px",
    //     },
    //     // headerTemplate,
    //     // headerTemplate,
    // });
    //
    // await browser.close();



    // // Create a page
    // const page = await browser.newPage();
    //
    // await page.setViewport({width: 1920, height: 1080});
    //
    // // Go to your site
    // await page.goto('https://magictest.dinglitec.com/player/index.html?templateId=1163717567884958434&jobId=1163717664528772332');
    //
    // await new Promise((resolve) => setTimeout(resolve, 1000000))
    //
    // await browser.close();
})()