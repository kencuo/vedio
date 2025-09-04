/**
 * SillyTavern 视频识别插件
 * 简化版 - 直接暴露SillyTavern本地API的视频识别功能
 * 让同层私聊能够上传视频获得短URL，然后AI识别
 */

const VIDEO_PLUGIN_NAME = 'SillyTavern视频识别插件';
const VIDEO_PLUGIN_VERSION = '1.1.0';

console.log(`🎬 ${VIDEO_PLUGIN_NAME} v${VIDEO_PLUGIN_VERSION} 正在加载...`);

/**
 * 视频识别核心类
 */
class VideoRecognitionCore {
  constructor() {
    this.isInitialized = false;
    this.supportedFormats = ['mp4', 'webm', 'ogg', 'avi', 'mov', 'mkv'];
    this.maxVideoSize = 100 * 1024 * 1024; // 100MB
  }

  /**
   * 初始化插件
   */
  async initialize() {
    try {
      // 检查SillyTavern环境
      if (!this.checkSillyTavernEnvironment()) {
        throw new Error('SillyTavern环境检查失败');
      }

      this.isInitialized = true;
      console.log('✅ 视频识别插件初始化成功');
      return true;
    } catch (error) {
      console.error('❌ 视频识别插件初始化失败:', error);
      return false;
    }
  }

  /**
   * 检查SillyTavern环境
   */
  checkSillyTavernEnvironment() {
    const requiredFunctions = [
      'saveBase64AsFile', // 文件保存函数
      'generate', // AI生成函数
    ];

    for (const funcName of requiredFunctions) {
      const func = window[funcName] || window.parent?.[funcName] || window.top?.[funcName];

      if (typeof func !== 'function') {
        console.warn(`⚠️ 缺少必要函数: ${funcName}`);
        return false;
      }
    }

    return true;
  }

  /**
   * 检查视频文件是否有效
   */
  validateVideoFile(file) {
    // 检查文件类型
    if (!file.type.startsWith('video/')) {
      throw new Error('不是有效的视频文件');
    }

    // 检查文件大小
    if (file.size > this.maxVideoSize) {
      throw new Error(`视频文件过大，最大支持 ${this.maxVideoSize / 1024 / 1024}MB`);
    }

    // 检查文件扩展名
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!this.supportedFormats.includes(extension)) {
      throw new Error(`不支持的视频格式: ${extension}`);
    }

    return true;
  }

  /**
   * 上传视频到SillyTavern并获取短URL
   */
  async uploadVideoToSillyTavern(file) {
    try {
      console.log(`🎬 开始上传视频: ${file.name}`);

      // 获取SillyTavern的saveBase64AsFile函数
      const saveBase64AsFile =
        window.saveBase64AsFile || window.parent?.saveBase64AsFile || window.top?.saveBase64AsFile;

      if (!saveBase64AsFile) {
        throw new Error('SillyTavern的saveBase64AsFile函数不可用');
      }

      // 转换视频为base64
      const base64Data = await this.convertFileToBase64(file);

      // 生成文件信息
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
        metadata: {
          originalName: file.name,
          originalSize: file.size,
          fileType: file.type,
          fileExtension: extension,
          uploadTime: new Date().toISOString(),
          urlLength: videoUrl.length,
        },
      };
    } catch (error) {
      console.error('❌ 视频上传失败:', error);
      throw error;
    }
  }

  /**
   * 使用AI识别视频内容
   */
  async recognizeVideoWithAI(videoUrl, prompt = null) {
    try {
      console.log('🤖 开始AI视频识别...');

      // 获取SillyTavern的AI生成函数
      const AI_GENERATE = window.generate || window.parent?.generate || window.top?.generate;

      if (!AI_GENERATE) {
        throw new Error('SillyTavern的AI生成函数不可用');
      }

      // 默认提示词
      const defaultPrompt = '请分析这个视频的内容，描述你看到的场景、动作、物体和任何重要的视觉信息。请用中文回答。';
      const analysisPrompt = prompt || defaultPrompt;

      // 构建AI请求
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
      const aiResponse = await AI_GENERATE(aiRequest);

      console.log('✅ AI视频识别完成');

      return {
        success: true,
        description: aiResponse,
        prompt: analysisPrompt,
        videoUrl: videoUrl,
      };
    } catch (error) {
      console.error('❌ AI视频识别失败:', error);
      throw error;
    }
  }

  /**
   * 完整的视频处理流程：上传 + AI识别
   */
  async processVideoComplete(file, options = {}) {
    try {
      console.log(`🎬 开始完整视频处理: ${file.name}`);

      // 1. 验证文件
      this.validateVideoFile(file);

      // 2. 上传视频获取短URL
      const uploadResult = await this.uploadVideoToSillyTavern(file);

      if (!uploadResult.success) {
        throw new Error('视频上传失败');
      }

      // 3. AI识别（如果启用）
      let aiResult = null;
      if (options.enableAI !== false) {
        // 默认启用AI识别
        try {
          aiResult = await this.recognizeVideoWithAI(uploadResult.url, options.prompt);
        } catch (aiError) {
          console.warn('⚠️ AI识别失败，但视频上传成功:', aiError);
          aiResult = {
            success: false,
            error: aiError.message,
          };
        }
      }

      // 4. 返回完整结果
      const result = {
        success: true,
        url: uploadResult.url,
        isShortUrl: uploadResult.isShortUrl,
        metadata: uploadResult.metadata,
        aiRecognition: aiResult,
        processingTime: Date.now(),
      };

      console.log('✅ 视频完整处理成功');
      return result;
    } catch (error) {
      console.error('❌ 视频完整处理失败:', error);
      return {
        success: false,
        error: error.message,
        metadata: {
          originalName: file.name,
          originalSize: file.size,
          fileType: file.type,
        },
      };
    }
  }

  /**
   * 将文件转换为base64
   */
  convertFileToBase64(file) {
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
}

// 创建全局实例
const videoRecognitionCore = new VideoRecognitionCore();

/**
 * 暴露给外部的API接口
 */

/**
 * 视频上传接口 - 只上传获取短URL
 */
window.__uploadVideoByPlugin = async function (file, options = {}) {
  if (!videoRecognitionCore.isInitialized) {
    await videoRecognitionCore.initialize();
  }

  return await videoRecognitionCore.uploadVideoToSillyTavern(file);
};

/**
 * 视频AI识别接口 - 只进行AI识别
 */
window.__recognizeVideoByPlugin = async function (videoUrl, prompt = null) {
  if (!videoRecognitionCore.isInitialized) {
    await videoRecognitionCore.initialize();
  }

  return await videoRecognitionCore.recognizeVideoWithAI(videoUrl, prompt);
};

/**
 * 视频完整处理接口 - 上传 + AI识别
 */
window.__processVideoByPlugin = async function (file, options = {}) {
  if (!videoRecognitionCore.isInitialized) {
    await videoRecognitionCore.initialize();
  }

  return await videoRecognitionCore.processVideoComplete(file, options);
};

/**
 * 检查视频文件类型
 */
window.__isVideoFile = function (file) {
  return file && file.type && file.type.startsWith('video/');
};

/**
 * 获取支持的视频格式
 */
window.__getSupportedVideoFormats = function () {
  return {
    formats: videoRecognitionCore.supportedFormats,
    maxSize: videoRecognitionCore.maxVideoSize,
    maxSizeMB: videoRecognitionCore.maxVideoSize / 1024 / 1024,
  };
};

/**
 * 插件状态检查
 */
window.__checkVideoPluginStatus = function () {
  return {
    pluginName: VIDEO_PLUGIN_NAME,
    version: VIDEO_PLUGIN_VERSION,
    initialized: videoRecognitionCore.isInitialized,
    environment: videoRecognitionCore.checkSillyTavernEnvironment(),
    supportedFormats: videoRecognitionCore.supportedFormats,
    maxVideoSize: `${videoRecognitionCore.maxVideoSize / 1024 / 1024}MB`,
  };
};

// 自动初始化
(async function () {
  try {
    await videoRecognitionCore.initialize();
    console.log(`🎉 ${VIDEO_PLUGIN_NAME} 加载完成！`);
    console.log('📋 可用接口:');
    console.log('  - window.__uploadVideoByPlugin(file, options)');
    console.log('  - window.__recognizeVideoByPlugin(videoUrl, prompt)');
    console.log('  - window.__processVideoByPlugin(file, options)');
    console.log('  - window.__isVideoFile(file)');
    console.log('  - window.__getSupportedVideoFormats()');
    console.log('  - window.__checkVideoPluginStatus()');
  } catch (error) {
    console.error(`❌ ${VIDEO_PLUGIN_NAME} 加载失败:`, error);
  }
})();
