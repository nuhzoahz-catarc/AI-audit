import mammoth from 'mammoth'; // 引入 mammoth 库，用于将 .docx 文件转换为 HTML

/**
 * 从 .docx 文件中提取 HTML 内容。
 * 我们使用 convertToHtml 而不是 convertToRawText，因为保留表格结构 (tr, td)
 * 对于 AI 理解表格数据的校验规则至关重要。
 * 
 * 我们显式禁用了图片提取，以防止 base64 图片数据过大，
 * 导致超出 LLM (大语言模型) 的 Token 限制。
 * 
 * 我们还进行了后处理，去除无用的 HTML 属性 (如 style, class)，
 * 进一步减少发送给 LLM 的 Token 数量，提高效率。
 */
export const extractContentFromDocx = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); // 创建 FileReader 对象读取文件
    
    // 当文件读取完成时的回调
    reader.onload = async (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer; // 获取文件的二进制数据
      if (!arrayBuffer) {
        reject(new Error("Failed to read file")); // 如果读取失败，拒绝 Promise
        return;
      }

      try {
        // 配置 mammoth 选项
        const options = {
          // 自定义图片处理程序：直接返回空源，忽略所有图片
          convertImage: mammoth.images.imgElement(() => {
            return Promise.resolve({ src: "" });
          })
        };
        
        // 调用 mammoth 将 docx 转换为 HTML
        const result = await mammoth.convertToHtml({ arrayBuffer }, options);
        let html = result.value; // 获取生成的 HTML 字符串

        // --- 优化步骤：清理 HTML 以节省 Token ---
        
        // 使用正则移除 class, style, width, height, id 属性
        // 这些样式信息对 AI 审核内容逻辑通常没有帮助，去除可大幅减小体积
        html = html.replace(/\s(class|style|width|height|id)="[^"]*"/g, '');
        
        // 移除空的 span 标签，Word 转换后经常产生大量无意义的 span
        html = html.replace(/<span>(.*?)<\/span>/g, '$1');
        
        // 合并连续的空白字符，进一步压缩字符串长度
        html = html.replace(/\s+/g, ' ');

        resolve(html); // 返回处理后的 HTML
      } catch (error) {
        console.error("Mammoth parsing error with options:", error);
        
        // 降级策略：如果带选项的转换失败（例如 API 版本不匹配），尝试默认转换
        try {
            console.warn("Retrying conversion without image suppression...");
            // 不带选项的转换（可能会包含 base64 图片，风险较高，但作为兜底）
            const fallbackResult = await mammoth.convertToHtml({ arrayBuffer });
            resolve(fallbackResult.value);
        } catch (fallbackError) {
            console.error("Mammoth fallback parsing error:", fallbackError);
            reject(fallbackError); // 如果再次失败，彻底拒绝
        }
      }
    };

    // 文件读取出错时的回调
    reader.onerror = (error) => reject(error);
    
    // 开始以 ArrayBuffer 格式读取文件
    reader.readAsArrayBuffer(file);
  });
};