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

// SillyTavern后端/images/upload支持的媒体扩展名（与constants.js保持一致的子集）
const ST_SUPPORTED_MEDIA_EXTS = ['bmp', 'png', 'jpg', 'jpeg', 'jfif', 'gif', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'];

function resolveVideoExtension(file) {
  // 优先从MIME类型映射
  const mime = (file.type || '').toLowerCase();
  const map = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/x-ms-wmv': 'wmv',
    'video/x-flv': 'flv',
    'video/ogg': 'ogg', // 可能不被images端点支持，稍后用回退
    'video/x-matroska': 'mkv', // 可能不被images端点支持，稍后用回退
  };
  let ext = map[mime];
  if (!ext) {
    // 再从文件名推断
    ext = (file.name.split('.').pop() || '').toLowerCase();
  }
  return ext || 'mp4';
}

async function uploadViaFilesEndpoint(fileName, base64Data) {
  const resp = await fetch('/api/files/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: fileName, data: base64Data }),
  });
  if (!resp.ok) {
    let msg;
    try {
      const data = await resp.json();
      msg = data.error || data.message;
    } catch {
      msg = await resp.text();
    }
    throw new Error(msg || `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.path;
}

async function getCurrentCharacterNameSafe() {
  try {
    const ctx = window.SillyTavern?.getContext?.();
    if (!ctx) return null;
    const currentCharacterId = ctx.characterId;
    const characters = await ctx.characters;
    const character = characters?.[currentCharacterId];
    return character?.name || null;
  } catch {
    return null;
  }
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
 * 超级简化版本：完全模仿识图插件的成功模式
 */
window.__processVideoComplete = async function (file, options = {}) {
  try {
    console.log(`🎬 [视频插件] 开始处理: ${file.name}`);
    console.log(`📋 [视频插件] 选项:`, JSON.stringify(options));
    console.log(`📊 [视频插件] 文件信息: ${file.type}, ${(file.size / 1024 / 1024).toFixed(2)}MB`);

    // 检查文件类型
    if (!file.type.startsWith('video/')) {
      throw new Error(`不是视频文件: ${file.type}`);
    }

    // 转换为base64（与识图插件完全相同的方式）
    console.log(`🔄 [视频插件] 开始base64转换...`);
    const fileReader = new FileReader();
    const base64Promise = new Promise((resolve, reject) => {
      fileReader.onload = e => resolve(e.target.result);
      fileReader.onerror = reject;
      fileReader.readAsDataURL(file);
    });

    const fileBase64 = await base64Promise;
    const base64Data = fileBase64.split(',')[1];
    console.log(`✅ [视频插件] base64转换完成，长度: ${base64Data.length}`);

    // 生成文件名（简化版本）
    const timestamp = Date.now();
    const extension = file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const fileName = `video_${timestamp}.${extension}`;
    console.log(`📝 [视频插件] 生成文件名: ${fileName}`);

    // 获取SillyTavern的saveBase64AsFile函数（与SillyTavern原生chats.js完全相同）
    const saveBase64AsFile = window.saveBase64AsFile || window.parent?.saveBase64AsFile || window.top?.saveBase64AsFile;

    if (!saveBase64AsFile) {
      throw new Error('SillyTavern的saveBase64AsFile函数不可用');
    }

    console.log(`✅ [视频插件] saveBase64AsFile函数已找到`);

    // 生成文件参数（与SillyTavern原生chats.js完全相同）
    const fileNamePrefix = `video_${timestamp}`;
    const name2 = (await getCurrentCharacterNameSafe()) || 'user'; // 尝试获取当前角色名

    console.log(`📝 [视频插件] 文件参数: name2=${name2}, prefix=${fileNamePrefix}, ext=${extension}`);

    // 双重上传策略：优先使用SillyTavern原生方式，失败时回退
    let videoUrl;
    let uploadMethod = 'unknown'; // images(files)

    // 方法1: 使用SillyTavern原生的saveBase64AsFile（优先）
    if (ST_SUPPORTED_MEDIA_EXTS.includes(extension)) {
      try {
        console.log(`📤 [视频插件] 方法1: 调用saveBase64AsFile (原生方式)...`);
        videoUrl = await saveBase64AsFile(base64Data, name2, fileNamePrefix, extension);
        uploadMethod = 'images';
        console.log(`✅ [视频插件] 原生方式成功! URL: ${videoUrl}`);
      } catch (saveError) {
        console.warn(`⚠️ [视频插件] 原生方式失败: ${saveError.message}`);
        console.log(`🔄 [视频插件] 回退到files端点...`);

        // 方法2: 回退到/api/files/upload
        const fallbackFileName = `${fileNamePrefix}.${extension}`;
        videoUrl = await uploadViaFilesEndpoint(fallbackFileName, base64Data);
        uploadMethod = 'files';
        console.log(`✅ [视频插件] 回退方式成功! URL: ${videoUrl}`);
      }
    } else {
      // 扩展名不被images端点支持，直接使用files端点
      console.log(`📤 [视频插件] 扩展名${extension}不被images端点支持，使用files端点...`);
      const fallbackFileName = `${fileNamePrefix}.${extension}`;
      videoUrl = await uploadViaFilesEndpoint(fallbackFileName, base64Data);
      uploadMethod = 'files';
      console.log(`✅ [视频插件] files端点成功! URL: ${videoUrl}`);
    }

    // 返回结果（与识图插件相同的格式）
    const result = {
      success: true,
      url: videoUrl,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      uploadTime: new Date().toISOString(),
      uploadMethod,
    };

    console.log(`🎉 [视频插件] 处理完成:`, result);
    return result;
  } catch (error) {
    console.error(`❌ [视频插件] 处理失败:`, error);
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
  const name2 = 'user';

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
