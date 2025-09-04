/**
 * ctrl同层手机喵识视频插件
 * 让同层私聊能够像SillyTavern原生界面一样上传视频：
 * 1. 上传视频到SillyTavern服务器 (使用/api/files/upload端点)
 * 2. 获得与原生上传相同格式的短URL
 * 3. AI识别视频内容 (使用generate函数)
 * 4. 统一的视频管理和AI识别体验
 *
 * 作者: kencuo
 * 项目: https://github.com/kencuo/chajian
 */

// 直接import SillyTavern的核心函数（修复版本）

const PLUGIN_NAME = 'ctrl同层手机喵识视频';
const PLUGIN_VERSION = '1.0.1';

console.log(`🎬 ${PLUGIN_NAME} v${PLUGIN_VERSION} 正在加载...`);

/**
 * 获取SillyTavern的generate函数
 */
function getGenerateFunction() {
  return window.generate || window.parent?.generate || window.top?.generate;
}

/**
 * 获取SillyTavern的getFileExtension函数
 */
function getFileExtensionFunction() {
  return window.getFileExtension || window.parent?.getFileExtension || window.top?.getFileExtension;
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
 * 上传视频到SillyTavern服务器并获取短URL
 * 使用SillyTavern官方的/api/files/upload端点，专门处理视频文件
 * 与识图插件使用不同的端点，因为saveBase64AsFile只支持图片
 */
window.__uploadVideoToSillyTavern = async function (file) {
  try {
    console.log(`🎬 开始上传视频: ${file.name}`);

    // 转换视频为base64
    const fileBase64 = await convertFileToBase64(file);
    const base64Data = fileBase64.split(',')[1];

    // 生成文件信息
    const extension = file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const timestamp = Date.now();
    const fileName = `video_${timestamp}.${extension}`;

    console.log(`📤 准备上传: ${fileName}`);

    // 直接调用SillyTavern的/api/files/upload端点（专门处理视频文件）
    const response = await fetch('/api/files/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: fileName,
        data: base64Data,
      }),
    });

    console.log(`📡 API响应状态: ${response.status}`);

    if (!response.ok) {
      let errorMessage;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      } catch {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const responseData = await response.json();
    const videoUrl = responseData.path;

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
 * 修复版本：简化依赖，直接处理
 */
window.__processVideoComplete = async function (file, options = {}) {
  try {
    console.log(`🎬 开始完整视频处理: ${file.name}`);
    console.log(`📋 选项:`, options);

    // 1. 上传视频获取短URL（直接在这里实现，避免函数依赖问题）
    console.log(`📤 开始上传视频...`);

    // 转换视频为base64
    const fileBase64 = await convertFileToBase64(file);
    const base64Data = fileBase64.split(',')[1];

    // 生成文件信息
    const extension = file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const timestamp = Date.now();
    const fileName = `video_${timestamp}.${extension}`;

    console.log(`📤 准备上传: ${fileName}`);

    // 直接调用SillyTavern的/api/files/upload端点
    const response = await fetch('/api/files/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: fileName,
        data: base64Data,
      }),
    });

    console.log(`📡 API响应状态: ${response.status}`);

    if (!response.ok) {
      let errorMessage;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      } catch {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const responseData = await response.json();
    const videoUrl = responseData.path;

    console.log(`✅ 视频上传成功: ${videoUrl}`);

    // 2. AI识别（如果启用）
    let aiResult = null;
    if (options.enableAI !== false && options.enableAI !== 'false') {
      console.log(`🤖 开始AI识别...`);
      try {
        aiResult = await window.__recognizeVideoWithAI(videoUrl, options.prompt);
        console.log(`✅ AI识别完成:`, aiResult);
      } catch (aiError) {
        console.warn(`⚠️ AI识别失败:`, aiError.message);
        aiResult = { success: false, error: aiError.message };
      }
    } else {
      console.log(`⏭️ 跳过AI识别 (enableAI=${options.enableAI})`);
    }

    // 3. 返回完整结果
    const result = {
      success: true,
      url: videoUrl,
      isShortUrl: videoUrl.length < 100,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      aiRecognition: aiResult,
      processingTime: new Date().toISOString(),
    };

    console.log('✅ 视频完整处理成功:', result);
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
  const getStringHash = getStringHashFunction();
  const getBase64Async = getBase64AsyncFunction();
  const getFileExtension = getFileExtensionFunction();
  const name2 = window.name2 || window.parent?.name2 || window.top?.name2;

  return {
    pluginName: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    environment: {
      hasSaveBase64AsFile: typeof saveFunction === 'function',
      hasGenerate: typeof generateFunction === 'function',
      hasGetStringHash: typeof getStringHash === 'function',
      hasGetBase64Async: typeof getBase64Async === 'function',
      hasGetFileExtension: typeof getFileExtension === 'function',
      hasName2: typeof name2 === 'string',
      name2Value: name2 || 'N/A',
      isReady:
        typeof saveFunction === 'function' &&
        typeof generateFunction === 'function' &&
        typeof getStringHash === 'function' &&
        typeof getBase64Async === 'function' &&
        typeof getFileExtension === 'function',
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
