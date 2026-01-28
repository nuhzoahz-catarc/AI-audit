import React from 'react'; // 引入 React 核心库
import ReactDOM from 'react-dom/client'; // 引入 React DOM 客户端渲染库
import App from './App'; // 引入主组件 App

// 获取 HTML 中 id 为 'root' 的 DOM 元素，这是 React 应用的挂载点
const rootElement = document.getElementById('root');

// 如果找不到根元素，抛出错误，防止应用在无效环境中运行
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// 使用 createRoot 创建 React 根节点（React 18+ 的新并发模式 API）
const root = ReactDOM.createRoot(rootElement);

// 将 React 应用渲染到根节点中
root.render(
  // StrictMode 用于开发环境，它会额外运行一些检查和警告，帮助发现潜在问题
  <React.StrictMode>
    <App />
  </React.StrictMode>
);