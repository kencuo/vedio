/**
 * ctrl同层手机喵识视频插件 (V3 - 免补丁健壮版)
 * 这是一个在无法应用补丁的情况下的最佳尝试版本。
 * 它会尝试直接访问SillyTavern主程序的功能，并优雅地处理因跨域安全限制而导致的失败。
 *
 * 作者: kencuo (由Gemini重构)
 * 项目: https://github.com/kencuo/chajian
 */

const PLUGIN_NAME = 'ctrl同层手机喵识视频 (免补丁健壮版)';
const PLUGIN_VERSION = '3.0.0';

console.log(`🎬 ${PLUGIN_NAME} v${PLUGIN_VERSION} 正在加载...`);

/**
 * @description 安全地从SillyTavern父窗口获取一个函数或变量。
 * 这是本插件的核心，用于在不导致崩溃的情况下处理跨域错误。
 * @param {string} name - 要获取的函数或变量的名称
 * @returns {any|null} - 如果成功则返回函数或变量，否则返回null。
 */
function getFromTavern(name) {
    try {
        if (typeof parent !== 'undefined' && parent && typeof parent[name] !== 'undefined') {
            return parent[name];
        }
    } catch (e) {
        // 这就是预期的跨域错误，我们在这里捕获它，防止它在控制台刷屏。
        // 我们只在第一次检查时打印一次警告。
        if (!window.__tavern_connection_failed) {
            console.warn(`❌ 无法访问SillyTavern功能'${name}'。这是由浏览器的跨域安全策略导致的。插件功能将受限。`);
            window.__tavern_connection_failed = true; // 设置一个标志，避免重复警告
        }
        return null;
    }
    return null;
}

/**
 * @description 将文件异步转换为Base64编码。这是一个独立的内部工具函数。
 * @param {File} file - 文件对象
 * @returns {Promise<string>} - 返回Base64字符串 (包含头部)
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}

/**
 * [公开API] 上传视频到SillyTavern服务器并获取短URL。
 * @param {File} file - 要上传的视频文件
 * @returns {Promise<object>} - 包含成功状态、URL、文件名等信息的对象
 */
window.__uploadVideoToSillyTavern = async function (file) {
    console.log(`🎬 [免补丁版] 尝试上传视频: ${file.name}`);
    
    // 每次调用时都重新获取函数，以防SillyTavern是后加载的
    const saveBase64AsFile = getFromTavern('saveBase64AsFile');
    const getStringHash = getFromTavern('getStringHash');
    const getFileExtension = getFromTavern('getFileExtension');
    const name2 = getFromTavern('name2');

    if (!saveBase64AsFile || !getStringHash || !getFileExtension || !name2) {
        const errorMsg = '无法连接到SillyTavern的核心上传功能。';
        console.error(`❌ [免补丁版] ${errorMsg}`);
        return { success: false, error: errorMsg, fileName: file.name, fileSize: file.size };
    }

    try {
        const fileBase64 = await fileToBase64(file);
        const base64Data = fileBase64.split(',')[1];
        if (!base64Data) throw new Error('无效的Base64数据');

        const slug = getStringHash(file.name);
        const fileNamePrefix = `${Date.now()}_${slug}`;
        const extension = getFileExtension({ name: file.name });
        
        const videoUrl = await saveBase64AsFile(base64Data, name2, fileNamePrefix, extension);

        console.log(`✅ [免补丁版] 视频上传成功: ${videoUrl}`);
        return {
            success: true,
            url: videoUrl,
            isShortUrl: videoUrl.length < 100,
            fileName: file.name,
            fileSize: file.size,
            uploadTime: new Date().toISOString(),
        };
    } catch (error) {
        console.error('❌ [免补丁版] 视频上传失败:', error);
        return { success: false, error: error.message, fileName: file.name, fileSize: file.size };
    }
};

/**
 * [公开API] 使用SillyTavern的AI识别视频内容。
 * @param {string} videoUrl - 视频的短URL
 * @param {string} [prompt=null] - 自定义AI提示词
 * @returns {Promise<object>} - 包含成功状态和AI描述的对象
 */
window.__recognizeVideoWithAI = async function (videoUrl, prompt = null) {
    console.log('🤖 [免补丁版] 尝试进行AI视频识别...');
    
    const generate = getFromTavern('generate');
    if (!generate) {
        const errorMsg = '无法连接到SillyTavern的AI生成功能。';
        console.error(`❌ [免补丁版] ${errorMsg}`);
        return { success: false, error: errorMsg, videoUrl: videoUrl };
    }
    
    try {
        const defaultPrompt = '请分析这个视频的内容，描述你看到的场景、动作、物体和任何重要的视觉信息。请用中文回答。';
        const analysisPrompt = prompt || defaultPrompt;

        const aiRequest = {
            injects: [{
                role: 'system',
                content: analysisPrompt,
                position: 'in_chat',
                depth: 0,
                should_scan: true,
            }],
            should_stream: false,
            video: videoUrl,
        };

        const aiResponse = await generate(aiRequest);
        console.log('✅ [免补丁版] AI视频识别完成');

        return {
            success: true,
            description: aiResponse,
            prompt: analysisPrompt,
            videoUrl: videoUrl,
        };
    } catch (error) {
        console.error('❌ [免补丁版] AI视频识别失败:', error);
        return { success: false, error: error.message, videoUrl: videoUrl };
    }
};

/**
 * [公开API] 完整的视频处理流程：上传 + AI识别。
 * @param {File} file - 要处理的视频文件
 * @param {object} [options={}] - 选项，例如 { enableAI: true, prompt: '...' }
 * @returns {Promise<object>} - 包含所有处理结果的最终对象
 */
window.__processVideoComplete = async function (file, options = {}) {
    console.log(`🎬 [免补丁版] 开始完整视频处理: ${file.name}`);
    try {
        const uploadResult = await window.__uploadVideoToSillyTavern(file);
        if (!uploadResult.success) {
            throw new Error(`视频上传失败: ${uploadResult.error}`);
        }

        let aiResult = null;
        if (options.enableAI !== false) {
            aiResult = await window.__recognizeVideoWithAI(uploadResult.url, options.prompt);
        }

        const result = {
            success: true,
            ...uploadResult,
            aiRecognition: aiResult,
        };
        console.log('✅ [免补丁版] 视频完整处理成功');
        return result;
    } catch (error) {
        console.error('❌ [免补丁版] 视频完整处理失败:', error);
        return { success: false, error: error.message, fileName: file.name, fileSize: file.size };
    }
};

/**
 * [公开API] 检查文件是否为视频。
 */
window.__isVideoFile = function (file) {
    return file && file.type && file.type.startsWith('video/');
};

/**
 * [公开API] 获取插件状态。
 */
window.__getVideoPluginStatus = function () {
    // 每次都实时检查
    const tavernFunctions = {
        saveBase64AsFile: getFromTavern('saveBase64AsFile'),
        generate: getFromTavern('generate'),
        getStringHash: getFromTavern('getStringHash'),
        getFileExtension: getFromTavern('getFileExtension'),
        name2: getFromTavern('name2'),
    };

    const isReady = Object.values(tavernFunctions).every(fn => fn !== null);

    return {
        pluginName: PLUGIN_NAME,
        version: PLUGIN_VERSION,
        communicationMethod: 'Direct Access (No-Patch)',
        isReady: isReady,
        details: {
            canUpload: !!tavernFunctions.saveBase64AsFile && !!tavernFunctions.getStringHash && !!tavernFunctions.getFileExtension && !!tavernFunctions.name2,
            canRecognize: !!tavernFunctions.generate,
            currentCharacter: tavernFunctions.name2 || 'N/A (无法连接)',
        }
    };
};

// 初始加载时打印一次状态
(function () {
    console.log(`🎉 ${PLUGIN_NAME} 加载完成！正在检查与SillyTavern的连接...`);
    setTimeout(() => {
        const status = window.__getVideoPluginStatus();
        if (status.isReady) {
            console.log("✅ 插件已准备就绪！所有功能可用。");
        } else {
            console.warn("⚠️ 插件功能受限。无法完全连接到SillyTavern。详情请查看 status.details。");
        }
        console.log("当前状态:", status);
    }, 1000);
})();

