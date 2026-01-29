// api/analyze-report.ts
// 跳过类型检查，避免找不到@vercel/node的报错
// @ts-ignore
export default async function handler(req: any, res: any) {
  // 允许跨域访问（解决前端调用API的跨域问题）
  res.setHeader('Access-Control-Allow-Origin', process.env.NEXT_PUBLIC_CF_DOMAIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理浏览器的OPTIONS预检请求（必须保留，否则跨域报错）
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 只允许POST请求（前端调用API用的是POST方式）
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: '只支持POST请求哦～' 
    });
  }

  try {
    // 接收前端传过来的报告内容和审核规则
    const { docContent, rules } = req.body;
    
    // 从Vercel环境变量中获取阿里云API Key（必须先在Vercel配置）
    const apiKey = process.env.ALIYUN_DASHSCOPE_API_KEY;

    // 检查API Key是否配置
    if (!apiKey) {
      throw new Error('阿里云API Key未配置！请去Vercel的环境变量里填写ALIYUN_DASHSCOPE_API_KEY');
    }

    // 截断过长的报告内容（阿里云AI单次处理内容有限制）
    const MAX_CONTENT_LENGTH = 80000;
    const truncatedContent = docContent.length > MAX_CONTENT_LENGTH
      ? docContent.substring(0, MAX_CONTENT_LENGTH)
      : docContent;

    // 格式化审核规则为列表形式（方便AI识别）
    const activeRules = rules.map((r: string) => `- ${r}`).join('\n');

    // 给阿里云AI的提示词（明确告诉AI要做什么）
    const prompt = `
      任务：作为 QA Audit System，根据规则审核提供的 HTML 报告内容。
      
      规则列表:
      ${activeRules}

      分类说明:
      1. text_editing: 文本/排版错误
      2. workflow_logic: 日期/逻辑/流程错误
      3. result_determination: 数值/结论判定错误
      4. special_rules: 其他类型错误

      要求：
      1. 严格按照规则分析报告内容，找出所有不符合规则的问题；
      2. 每个问题必须标注对应的分类、违反的规则原文、详细描述、严重程度（high/medium/low）和位置；
      3. 必须严格按照以下JSON格式返回，只返回JSON，不要加任何额外文字：
      {
        "overallStatus": "PASS/FAIL/WARNING",
        "summary": "简洁的审核总结（比如：共发现2个问题，1个高风险）",
        "issues": [
          {
            "category": "text_editing/workflow_logic/result_determination/special_rules",
            "rule": "违反的规则原文",
            "description": "问题的详细描述",
            "severity": "high/medium/low",
            "location": "问题出现的位置（比如：第3行/页眉/表格第2列）"
          }
        ]
      }

      报告内容:
      ${truncatedContent}
    `;

    // 调用阿里云通义千问API（不用SDK，直接发HTTP请求）
    const response = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`, // 阿里云API Key认证
      },
      body: JSON.stringify({
        model: 'qwen-turbo', // 通义千问轻量版（免费/低成本，稳定）
        input: {
          messages: [{ 
            role: 'user', 
            content: prompt 
          }],
        },
        parameters: {
          result_format: 'json',
          temperature: 0.1, // 0.1表示回答更精准，不随意
          max_tokens: 4096, // 最大返回字符数
        },
      }),
    });

    // 解析阿里云API的返回结果
    const data = await response.json();
    
    // 如果阿里云API返回错误，直接抛出
    if (!response.ok) {
      throw new Error(`阿里云AI返回错误：${JSON.stringify(data)}`);
    }

    // 提取AI生成的审核结果
    const jsonStr = data.output?.choices?.[0]?.message?.content;
    if (!jsonStr) {
      throw new Error('阿里云AI未返回有效审核结果');
    }

    // 解析AI返回的JSON内容
    const auditResult = JSON.parse(jsonStr);

    // 返回给前端的最终结果（格式和前端预期一致）
    res.status(200).json({
      status: auditResult.overallStatus === 'FAIL' ? 'FAIL' : (auditResult.overallStatus === 'WARNING' ? 'WARNING' : 'PASS'),
      summary: auditResult.summary || '未生成审核总结',
      issues: auditResult.issues || [],
      processedAt: new Date().toISOString(),
    });

  } catch (error: any) {
    // 出错时返回友好的错误信息
    res.status(500).json({
      status: 'ERROR',
      summary: `审核失败：${error.message || '未知错误'}`,
      issues: [{
        category: 'special_rules',
        rule: 'AI审核服务异常',
        description: error.message || '请检查阿里云API Key是否正确，或阿里云账号是否开通通义千问服务',
        severity: 'high',
        location: '',
      }],
      processedAt: new Date().toISOString(),
    });
  }
}
