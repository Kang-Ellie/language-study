import { useRef, useState } from 'react'
import {
  applyBackup,
  createBackup,
  downloadBlob,
  formatBytes,
  readBackup,
  type BackupBundle,
  type ImportMode,
  type ImportSummary,
} from '../lib/backup'

export default function BackupPanel() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastExport, setLastExport] = useState<string | null>(null)
  const [bundle, setBundle] = useState<BackupBundle | null>(null)
  const [mode, setMode] = useState<ImportMode>('merge')
  const [result, setResult] = useState<ImportSummary | null>(null)

  async function onExport() {
    setError(null)
    setBusy('백업 파일을 만드는 중…')
    try {
      const { blob, filename, manifest } = await createBackup()
      downloadBlob(blob, filename)
      const s = manifest.summary
      setLastExport(
        `${filename} · ${formatBytes(blob.size)} · 책 ${s.books}권, 기록 ${s.logEntries}개, 오디오 ${s.audio}개, 사진 ${s.images}개`
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '백업을 만들지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 다시 골라도 동작하도록
    if (!file) return
    setError(null)
    setResult(null)
    setBundle(null)
    setBusy('백업 파일을 확인하는 중…')
    try {
      setBundle(await readBackup(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : '백업 파일을 읽지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  async function onApply() {
    if (!bundle) return
    const s = bundle.manifest.summary
    const msg =
      mode === 'replace'
        ? `덮어쓰기: 지금 이 기기의 기록이 백업 내용으로 완전히 바뀝니다.\n(책 ${s.books}권 · 기록 ${s.logEntries}개 · XP ${s.xp} · 스트릭 ${s.streak}일)\n\n지금 기기에만 있는 기록은 사라져요. 계속할까요?`
        : `합치기: 백업에만 있는 책·기록·파일을 추가합니다.\n지금 기기의 진행도(XP·스트릭·복습 상태)는 그대로 둡니다.\n\n계속할까요?`
    if (!confirm(msg)) return

    setError(null)
    setBusy('복원하는 중…')
    try {
      const summary = await applyBackup(bundle, mode, (done, total) =>
        setBusy(`복원하는 중… ${done}/${total}`)
      )
      setResult(summary)
      setBundle(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '복원하지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  const m = bundle?.manifest
  const totalBytes = m?.files.reduce((n, f) => n + f.bytes, 0) ?? 0

  return (
    <section className="card">
      <h3>💾 백업 · 복원</h3>
      <p className="backup-hint">
        이 앱의 모든 기록은 이 맥북 브라우저 안에만 있어요. 브라우저 데이터를 지우거나 맥북이 고장 나면
        녹음·필기·진도가 전부 사라집니다. <b>가끔 내보내서 파일로 보관해 두세요.</b>
      </p>

      <div className="backup-row">
        <button className="btn" onClick={onExport} disabled={!!busy}>
          ⬇️ 백업 내보내기 (zip)
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          ⬆️ 백업 가져오기
        </button>
        <input ref={fileRef} type="file" accept=".zip,application/zip" onChange={onPick} hidden />
      </div>

      {busy && <p className="backup-status">⏳ {busy}</p>}
      {error && <p className="backup-status danger-text">⚠️ {error}</p>}
      {lastExport && !busy && <p className="backup-status">✅ 저장했어요 — {lastExport}</p>}

      {m && (
        <div className="backup-preview">
          <div className="backup-preview-title">
            📦 {new Date(m.createdAt).toLocaleString('ko-KR')} 백업
          </div>
          <ul className="backup-list">
            <li>책 {m.summary.books}권</li>
            <li>학습 기록 {m.summary.logEntries}개</li>
            <li>
              오디오 {m.summary.audio}개 · 사진 {m.summary.images}개 ({formatBytes(totalBytes)})
            </li>
            <li>
              XP {m.summary.xp} · 스트릭 {m.summary.streak}일 · 공부한 날 {m.summary.studyDays}일
            </li>
          </ul>

          <label className="backup-mode">
            <input
              type="radio"
              checked={mode === 'merge'}
              onChange={() => setMode('merge')}
            />
            <span>
              <b>합치기</b> — 백업에만 있는 것을 추가해요. 지금 진행도는 그대로.
            </span>
          </label>
          <label className="backup-mode">
            <input
              type="radio"
              checked={mode === 'replace'}
              onChange={() => setMode('replace')}
            />
            <span>
              <b>덮어쓰기</b> — 백업 시점으로 되돌려요. 지금 기기에만 있는 기록은 사라져요.
            </span>
          </label>

          <div className="backup-row">
            <button className="btn primary" onClick={onApply} disabled={!!busy}>
              이 백업 적용하기
            </button>
            <button className="btn ghost" onClick={() => setBundle(null)} disabled={!!busy}>
              취소
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="backup-preview">
          <div className="backup-preview-title">
            ✅ 복원 완료 ({result.mode === 'merge' ? '합치기' : '덮어쓰기'})
          </div>
          <ul className="backup-list">
            <li>책 {result.booksAdded}권 · 기록 {result.logsAdded}개</li>
            <li>
              파일 {result.filesWritten}개 저장
              {result.filesSkipped > 0 && ` · ${result.filesSkipped}개 건너뜀(이미 있음)`}
            </li>
            {result.mode === 'merge' && <li>진행도(XP·스트릭·복습 상태)는 그대로 두었어요.</li>}
            {result.warnings.map((w, i) => (
              <li key={i} className="danger-text">⚠️ {w}</li>
            ))}
          </ul>
          <button className="btn primary" onClick={() => location.reload()}>
            새로고침해서 확인하기
          </button>
        </div>
      )}
    </section>
  )
}
