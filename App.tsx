import React from 'react';
import Dashboard from './components/Dashboard';

// 主应用组件，作为整个应用的顶层容器
const App: React.FC = () => {
  return (
    // 全屏容器，设置淡蓝色背景和默认文字颜色
    <div className="min-h-screen bg-sky-50 text-slate-800">
      {/* 渲染仪表盘组件，这里包含了所有的核心业务逻辑 */}
      <Dashboard />
    </div>
  );
};

export default App;