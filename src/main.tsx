import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { builtinBooks } from './data'
import { migrate } from './lib/migrate'

// 앱이 그려지기 전에 저장된 데이터를 최신 스키마로 올린다.
// (loadState()가 상태를 읽기 전에 끝나야 하므로 여기서 동기 실행)
const report = migrate(builtinBooks)
if (report.ran) {
  console.info(`[마이그레이션 v${report.from}→v${report.to}]`, report)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App report={report} />
  </React.StrictMode>
)
