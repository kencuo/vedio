/**
 * ctrl同层手机喵识视频插件
 * 直接暴露SillyTavern本地API，让同层私聊能够：
 * 1. 上传视频获得短URL (使用saveBase64AsFile)
 * 2. AI识别视频内容 (使用generate函数)
 *
 * 作者: kencuo
 * 项目: https://github.com/kencuo/chajian
 */

const PLUGIN_NAME = 'ctrl同层手机喵识视频';
const PLUGIN_VERSION = '1.0.0';

console.log(`🎬 ${PLUGIN_NAME} v${PLUGIN_VERSION} 正在加载...`);

/**
 * 获取SillyTavern的saveBase64AsFile函数
 */
function getSaveBase64AsFileFunction() {
  return window.saveBase64AsFile || window.parent?.saveBase64AsFile || window.top?.saveBase64AsFile;
}

/**
 * 获取SillyTavern的generate函数
 */
function getGenerateFunction() {
  return window.generate || window.parent?.generate || window.top?.generate;
}

/**
 * 将文件转换为base64
 */
function convertFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      resolve(e.target.result);
    };
    reader.onerror = function (error) {
      reject(error);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * 上传视频到SillyTavern并获取短URL
 * 这是SillyTavern官方的方式，与chat.js中的处理相同
 */
window.__uploadVideoToSillyTavern = async function (file) {
  try {
    console.log(`🎬 开始上传视频: ${file.name}`);

    // 获取SillyTavern的saveBase64AsFile函数
    const saveBase64AsFile = getSaveBase64AsFileFunction();
    if (!saveBase64AsFile) {
      throw new Error('SillyTavern的saveBase64AsFile函数不可用');
    }

    // 转换视频为base64
    const base64Data = await convertFileToBase64(file);

    // 生成文件信息（与官方chat.js相同的方式）
    const extension = file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const timestamp = Date.now();
    const name2 = `video_${timestamp}`;
    const fileNamePrefix = `video_${timestamp}`;

    // 使用SillyTavern官方函数保存视频
    const videoUrl = await saveBase64AsFile(base64Data, name2, fileNamePrefix, extension);

    console.log(`✅ 视频上传成功: ${videoUrl}`);
    console.log(`📏 URL长度: ${videoUrl.length} 字符`);

    return {
      success: true,
      url: videoUrl,
      isShortUrl: videoUrl.length < 100,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      uploadTime: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ 视频上传失败:', error);
    return {
      success: false,
      error: error.message,
      fileName: file.name,
      fileSize: file.size,
    };
  }
};

/**
 * 使用SillyTavern的AI识别视频内容
 * 这是SillyTavern官方支持的方式
 */
window.__recognizeVideoWithAI = async function (videoUrl, prompt = null) {
  try {
    console.log('🤖 开始AI视频识别...');

    // 获取SillyTavern的AI生成函数
    const generate = getGenerateFunction();
    if (!generate) {
      throw new Error('SillyTavern的generate函数不可用');
    }

    // 默认提示词
    const defaultPrompt = '请分析这个视频的内容，描述你看到的场景、动作、物体和任何重要的视觉信息。请用中文回答。';
    const analysisPrompt = prompt || defaultPrompt;

    // 构建AI请求（与测试文件中相同的格式）
    const aiRequest = {
      injects: [
        {
          role: 'system',
          content: analysisPrompt,
          position: 'in_chat',
          depth: 0,
          should_scan: true,
        },
      ],
      should_stream: false,
      video: videoUrl, // 关键：传递视频URL给AI
    };

    console.log('🤖 发送AI识别请求...');
    const aiResponse = await generate(aiRequest);

    console.log('✅ AI视频识别完成');

    return {
      success: true,
      description: aiResponse,
      prompt: analysisPrompt,
      videoUrl: videoUrl,
    };
  } catch (error) {
    console.error('❌ AI视频识别失败:', error);
    return {
      success: false,
      error: error.message,
      videoUrl: videoUrl,
    };
  }
};

/**
 * 完整的视频处理：上传 + AI识别
 * 这是同层私聊最需要的功能
 */
window.__processVideoComplete = async function (file, options = {}) {
  try {
    console.log(`🎬 开始完整视频处理: ${file.name}`);

    // 1. 上传视频获取短URL
    const uploadResult = await window.__uploadVideoToSillyTavern(file);
    if (!uploadResult.success) {
      throw new Error(`视频上传失败: ${uploadResult.error}`);
    }

    // 2. AI识别（如果启用）
    let aiResult = null;
    if (options.enableAI !== false) {
      // 默认启用AI识别
      aiResult = await window.__recognizeVideoWithAI(uploadResult.url, options.prompt);
    }

    // 3. 返回完整结果
    const result = {
      success: true,
      url: uploadResult.url,
      isShortUrl: uploadResult.isShortUrl,
      fileName: uploadResult.fileName,
      fileSize: uploadResult.fileSize,
      aiRecognition: aiResult,
      processingTime: new Date().toISOString(),
    };

    console.log('✅ 视频完整处理成功');
    return result;
  } catch (error) {
    console.error('❌ 视频完整处理失败:', error);
    return {
      success: false,
      error: error.message,
      fileName: file.name,
      fileSize: file.size,
    };
  }
};

/**
 * 检查视频文件类型
 */
window.__isVideoFile = function (file) {
  return file && file.type && file.type.startsWith('video/');
};

/**
 * 获取插件状态
 */
window.__getVideoPluginStatus = function () {
  const saveFunction = getSaveBase64AsFileFunction();
  const generateFunction = getGenerateFunction();

  return {
    pluginName: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    environment: {
      hasSaveBase64AsFile: typeof saveFunction === 'function',
      hasGenerate: typeof generateFunction === 'function',
      isReady: typeof saveFunction === 'function' && typeof generateFunction === 'function',
    },
    supportedFormats: ['mp4', 'webm', 'ogg', 'avi', 'mov', 'mkv'],
    maxVideoSize: '100MB',
  };
};

// 自动检查环境
(function () {
  try {
    const status = window.__getVideoPluginStatus();
    if (status.environment.isReady) {
      console.log(`🎉 ${PLUGIN_NAME} 加载完成！`);
      console.log('📋 可用接口:');
      console.log('  - window.__uploadVideoToSillyTavern(file)');
      console.log('  - window.__recognizeVideoWithAI(videoUrl, prompt)');
      console.log('  - window.__processVideoComplete(file, options)');
      console.log('  - window.__isVideoFile(file)');
      console.log('  - window.__getVideoPluginStatus()');
    } else {
      console.warn(`⚠️ ${PLUGIN_NAME} 环境检查失败:`, status.environment);
    }
  } catch (error) {
    console.error(`❌ ${PLUGIN_NAME} 加载失败:`, error);
  }
})();
