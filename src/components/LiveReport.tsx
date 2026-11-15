// Báo cáo trực tuyến chi tiết cho giáo viên: dùng được khi phiên đang diễn ra và sau khi kết thúc, trên máy tính lẫn điện thoại.
// Cách tính và 4 mức đánh giá trùng với bảng tổng kết của học sinh.
import { useMemo, useState } from 'react';
import { Download, FileText, HeartHandshake, Medal } from 'lucide-react';
import type { Quiz, Session } from '../lib/types';
import { LEVELS, LEVEL_LABEL, analyticsSheets, analyze } from '../lib/analytics';
import { buildXlsx, downloadBlob } from '../lib/xlsx';
import { formatDuration } from '../lib/util';
import { Avatar } from './Avatar';
import '../report.css';

export function LiveReport({ s, quiz }: { s: Session; quiz: Quiz | null }) {
  const [cls, setCls] = useState('');
  const [sort, setSort] = useState<'rank' | 'name' | 'weak'>('rank');
  const a = useMemo(() => analyze(s, quiz), [s, quiz]);
  const timed = s.settings.mode === 'classic_live' || s.settings.mode === 'homework'; // có thời gian làm cả bài
  const fastest = timed ? [...a.students].filter((x) => x.duration_ms !== null).sort((x, y) => x.duration_ms! - y.duration_ms!)[0] : undefined;
  const latest = a.students.filter((x) => x.latest);
  const best = latest.filter((x) => x.answered > 0).slice(0, 5);
  const weak = latest.filter((x) => x.answered > 0 && x.level === 'effort').slice(-5).reverse();
  const many = a.attempts > a.total_students; // có em làm lại nhiều lần
  const rows = useMemo(() => {
    const list = a.students.filter((x) => !cls || (x.class_name || 'Chưa ghi lớp') === cls);
    if (sort === 'name') return [...list].sort((x, y) => x.name.localeCompare(y.name, 'vi'));
    if (sort === 'weak') return [...list].reverse();
    return list;
  }, [a, cls, sort]);

  const exportXlsx = async () => downloadBlob(`Quickplay-bao-cao-${s.pin}.xlsx`, await buildXlsx(analyticsSheets(s, a)));
  // PDF: dùng hộp thoại in của trình duyệt với khổ A4 ngang, lề tối thiểu (chọn "Lưu thành PDF")
  const exportPdf = () => {
    document.documentElement.classList.add('print-report');
    const done = () => {
      document.documentElement.classList.remove('print-report');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  };

  if (!a.total_students) return <div className="card"><p className="muted" style={{ margin: 0 }}>Chưa có học sinh nào trong phòng.</p></div>;
  return (
    <div className="stack rp" style={{ gap: 16 }}>
      <div className="rp-print-head">
        <b>Quickplay · Báo cáo kết quả: {s.quiz_title}</b>
        <span>Mã phòng {s.pin} · {new Date(s.created_at).toLocaleString('vi-VN')} · Tác giả phần mềm: Nguyễn Thanh Liêm – Zalo: 0888358363</span>
      </div>
      <div className="row between rp-tools">
        {a.live ? <span className="badge amber">Đang diễn ra: tạm tính trên các câu mỗi em đã làm</span> : <span className="badge green">Đã kết thúc: tính trên tổng số câu, bỏ trống tính là sai</span>}
        <div className="row">
          <button className="btn ghost" onClick={exportPdf}><FileText size={18} /> Xuất PDF (A4 ngang)</button>
          <button className="btn primary" onClick={exportXlsx}><Download size={18} /> Xuất Excel chi tiết</button>
        </div>
      </div>

      <div className="rp-tiles">
        <div className="rp-tile"><small>Học sinh</small><b>{a.total_students}</b><span>{a.finished} em đã xong{many ? ` · ${a.attempts} lượt làm` : ''}</span></div>
        <div className="rp-tile"><small>Đúng hoàn toàn</small><b className="t-ok">{a.full_pct}%</b><span>{a.full}/{a.answered} lượt trả lời</span></div>
        <div className="rp-tile"><small>Đúng một phần</small><b className="t-part">{a.partial_pct}%</b><span>{a.partial}/{a.answered} lượt trả lời</span></div>
        <div className="rp-tile"><small>Sai</small><b className="t-bad">{a.wrong_pct}%</b><span>{a.wrong}/{a.answered} lượt trả lời</span></div>
        <div className="rp-tile"><small>Đạt yêu cầu trở lên</small><b>{a.pass_pct}%</b><span>{a.pass_count}/{a.rated} em</span></div>
        <div className="rp-tile"><small>Điểm trung bình</small><b>{a.avg10.toLocaleString('vi-VN')}</b><span>thang điểm 10</span></div>
        {fastest && <div className="rp-tile"><small>Làm nhanh nhất</small><b style={{ fontSize: '1.3rem' }}>{formatDuration(fastest.duration_ms!)}</b><span>{fastest.name}</span></div>}
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Mức đánh giá</h3>
        <div className="rp-bar" role="img" aria-label={LEVELS.map((g) => `${LEVEL_LABEL[g]}: ${a.levels[g]} em`).join(', ')}>
          {LEVELS.map((g) => a.levels[g] > 0 && <i key={g} className={g} style={{ flexGrow: a.levels[g] }}>{a.levels[g]}</i>)}
          {!a.rated && <i className="none" style={{ flexGrow: 1 }}>Chưa có câu trả lời</i>}
        </div>
        <div className="row small">
          {LEVELS.map((g) => (
            <span key={g} className="rp-key"><i className={g} /> {LEVEL_LABEL[g]}: <b>{a.levels[g]}</b> em{a.rated ? ` (${Math.round((a.levels[g] / a.rated) * 100)}%)` : ''}</span>
          ))}
        </div>
        <p className="help" style={{ margin: 0 }}>
          Xếp theo số điểm đạt được (câu đúng một phần tính theo phần đúng): Hoàn thành xuất sắc từ 90% · Hoàn thành tốt từ 70% · Đạt yêu cầu từ 50% · Chưa đạt yêu cầu dưới 50%.
          Học sinh thấy đúng các con số và mức này trên bảng tổng kết của mình.
        </p>
      </div>

      <div className="rp-two">
        <div className="card stack">
          <h3 className="row" style={{ gap: 8, margin: 0 }}><Medal size={20} color="var(--success)" /> Làm tốt nhất</h3>
          {best.length ? best.map((x) => (
            <div key={x.player_id} className="rp-person">
              <Avatar value={x.avatar} size={32} /><span className="grow"><b>{x.name}</b>{x.class_name && <small className="muted"> · {x.class_name}</small>}</span>
              <span className="badge green">{x.pct}% · đúng {x.correct} câu{x.duration_ms !== null ? ` · ${formatDuration(x.duration_ms)}` : ''}</span>
            </div>
          )) : <p className="muted" style={{ margin: 0 }}>Chưa có câu trả lời.</p>}
        </div>
        <div className="card stack">
          <h3 className="row" style={{ gap: 8, margin: 0 }}><HeartHandshake size={20} color="var(--danger)" /> Cần hỗ trợ thêm</h3>
          {weak.length ? weak.map((x) => (
            <div key={x.player_id} className="rp-person">
              <Avatar value={x.avatar} size={32} /><span className="grow"><b>{x.name}</b>{x.class_name && <small className="muted"> · {x.class_name}</small>}</span>
              <span className="badge red">{x.pct}% · sai {x.wrong} câu</span>
            </div>
          )) : <p className="muted" style={{ margin: 0 }}>Chưa có em nào ở mức chưa đạt yêu cầu.</p>}
        </div>
      </div>

      {a.classes.length > 1 && (
        <div className="card">
          <h3>So sánh giữa các lớp</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Lớp</th><th>Học sinh</th><th>Đúng hoàn toàn</th><th>Đúng một phần</th><th>Số điểm đạt</th><th>Đạt yêu cầu trở lên</th><th>Điểm TB</th></tr></thead>
              <tbody>
                {a.classes.map((c) => (
                  <tr key={c.class_name}>
                    <td><b>{c.class_name}</b></td><td>{c.students}</td><td>{c.pct_full}%</td><td>{c.pct_partial}%</td>
                    <td style={{ minWidth: 120 }}><div className="progress"><i style={{ width: `${c.pct}%` }} /></div>{c.pct}%</td>
                    <td>{c.pass_pct}%</td><td>{c.avg10.toLocaleString('vi-VN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {a.questions.length > 0 && (
        <div className="card">
          <h3>Tỉ lệ đúng sai từng câu</h3>
          {a.hardest.length > 0 && (
            <div className="alert warn" style={{ marginBottom: 10 }}><div><b>Nên giảng lại:</b> {a.hardest.map((q) => `câu ${q.index} (${q.pct}% đúng)`).join(', ')}.</div></div>
          )}
          <div className="rp-qs">
            {a.questions.map((q) => (
              <div key={q.question_id} className="rp-q" title={q.text}>
                <b>Câu {q.index}</b>
                <span className="rp-qtext">{q.text}</span>
                <span className="rp-split" role="img" aria-label={`${q.correct} đúng hoàn toàn, ${q.answered - q.correct} chưa đúng hoàn toàn`}>
                  {q.answered ? (
                    <>
                      {q.correct > 0 && <i className="excellent" style={{ flexGrow: q.correct }}>{q.correct}</i>}
                      {q.answered - q.correct > 0 && <i className="bad" style={{ flexGrow: q.answered - q.correct }}>{q.answered - q.correct}</i>}
                    </>
                  ) : <i className="none" style={{ flexGrow: 1 }}>chưa có</i>}
                </span>
                <span className="rp-pct">{q.answered ? `${q.pct}%` : q.pending ? 'chờ chấm' : '—'}</span>
              </div>
            ))}
          </div>
          <p className="help" style={{ margin: '8px 0 0' }}>Xanh: số em đúng hoàn toàn · Đỏ: số em sai hoặc chỉ đúng một phần.</p>
        </div>
      )}

      <div className="card">
        <div className="row between rp-tools" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Chi tiết từng học sinh{many && <small className="muted" style={{ fontWeight: 500 }}> · các lần làm của cùng một em nằm liền nhau, lần mới nhất ở trên; số liệu tổng chỉ tính lần mới nhất</small>}</h3>
          <div className="row">
            {a.classes.length > 1 && (
              <select className="input rp-select" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Lọc theo lớp">
                <option value="">Tất cả lớp</option>
                {a.classes.map((c) => <option key={c.class_name} value={c.class_name}>{c.class_name}</option>)}
              </select>
            )}
            <select className="input rp-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sắp xếp">
              <option value="rank">Từ cao xuống thấp</option>
              <option value="weak">Từ thấp lên cao</option>
              <option value="name">Theo tên</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>Học sinh</th><th>Lớp</th>{many && <th>Lần làm</th>}{many && <th>Bắt đầu lúc</th>}<th>Đúng hoàn toàn</th><th>Đúng một phần</th><th>Sai</th><th>Chưa làm</th><th>Số điểm đạt</th><th>Điểm 10</th>{timed && <th>Thời gian làm bài</th>}<th>Mức đánh giá</th></tr></thead>
            <tbody>
              {rows.map((x, i) => (
                <tr key={x.player_id} className={x.latest ? undefined : 'rp-old'}>
                  <td>{i + 1}</td>
                  <td><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Avatar value={x.avatar} size={28} /> <b>{x.name}</b></span></td>
                  <td>{x.class_name || '—'}</td>
                  {many && <td style={{ whiteSpace: 'nowrap' }}>Lần {x.attempt_no}{x.latest && x.attempt_no > 1 ? ' (mới nhất)' : ''}</td>}
                  {many && <td style={{ whiteSpace: 'nowrap' }}>{new Date(x.started_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>}
                  <td>{x.correct} <small className="muted">({x.pct_full}%)</small></td>
                  <td>{x.partial} <small className="muted">({x.pct_partial}%)</small></td>
                  <td>{x.wrong}</td><td>{x.blank}</td>
                  <td style={{ minWidth: 110 }}><div className="progress"><i style={{ width: `${x.pct}%` }} /></div>{x.pct}%</td>
                  <td><b>{x.mark10.toLocaleString('vi-VN')}</b></td>
                  {timed && <td style={{ whiteSpace: 'nowrap' }}>{x.duration_ms === null ? <span className="muted">Chưa nộp</span> : formatDuration(x.duration_ms)}</td>}
                  <td>{!a.live || x.finished ? <span className={`rp-grade ${x.level}`}>{LEVEL_LABEL[x.level]}</span> : x.answered > 0 ? <span className="muted">Đang làm ({x.answered}/{s.question_count} câu)</span> : <span className="muted">Chưa làm</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
