import { AuditResult, AuditStatus } from "../types";

// 调用阿里云AI的“中转站”（后面会建）
export const analyzeReport = async (
  docContent: string,
  rules: string[]
): Promise<AuditResult> => {
  try {
    // 给中转站发请求
    const response = await fetch("/api/analyze-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ docContent, rules }),
      signal: AbortSignal.timeout(30000), // 30秒没回应就等不及啦
    });

    if (!response.ok) {
      throw new Error(`请求失败啦 [${response.status}]`);
    }

    const result = await response.json();
    return result;
  } catch (error: any) {
    let errorMessage = "审核服务调用失败，请稍后重试";
    if (error.name === "AbortError") {
      errorMessage = "请求超时啦（文档太大或网络慢）";
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      status: AuditStatus.ERROR,
      summary: errorMessage,
      issues: [
        {
          category: "special_rules",
          rule: "服务调用失败",
          description: errorMessage,
          severity: "high",
          location: "",
        },
      ],
      processedAt: new Date().toISOString(),
    };
  }
};