import React, { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Download, FileSpreadsheet, FileText } from "lucide-react";

// ---- date helpers (all local time, week runs Monday to Sunday) ----
function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseYmd(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function addDays(key, amount) {
  const date = parseYmd(key);
  date.setDate(date.getDate() + amount);
  return ymd(date);
}
export function weekStartKey(offset = 0, now = new Date()) {
  const sinceMonday = (now.getDay() + 6) % 7;
  return ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday + offset * 7));
}
function dayOfTask(task) {
  return task.dueDate || ymd(new Date(task.createdAt || Date.now()));
}
export function formatMinutes(total) {
  const hours = Math.floor(total / 60);
  const minutes = Math.round(total % 60);
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}
export function rangeLabel(startKey) {
  const start = parseYmd(startKey);
  const end = parseYmd(addDays(startKey, 6));
  const format = date => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${format(start)} – ${format(end)}, ${end.getFullYear()}`;
}

// ---- summary ----
export function summarizeWeek(tasks, startKey) {
  const keys = Array.from({ length: 7 }, (_, index) => addDays(startKey, index));
  const days = keys.map(key => ({ key, label: parseYmd(key).toLocaleDateString("en-US", { weekday: "short" }), done: 0, open: 0 }));
  const inWeek = tasks.filter(task => keys.includes(dayOfTask(task)));
  inWeek.forEach(task => {
    const day = days[keys.indexOf(dayOfTask(task))];
    if (task.done) day.done += 1; else day.open += 1;
  });
  const done = inWeek.filter(task => task.done);
  const open = inWeek.filter(task => !task.done);
  const byDay = (a, b) => dayOfTask(a).localeCompare(dayOfTask(b));
  const focusSeconds = inWeek.reduce((sum, task) => sum + (task.elapsedSeconds || 0), 0);
  const best = days.reduce((top, day) => (day.done > (top ? top.done : 0) ? day : top), null);
  return {
    days, total: inWeek.length, done: done.sort(byDay), open: open.sort(byDay), focusSeconds,
    completion: inWeek.length ? Math.round((done.length / inWeek.length) * 100) : 0,
    bestDay: best && best.done > 0 ? best : null
  };
}

// ---- CSV ----
function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function weeklyCsv(summary) {
  const rows = [["Date", "Task", "Category", "Priority", "Status", "Focus minutes"]];
  [...summary.done, ...summary.open].sort((a, b) => dayOfTask(a).localeCompare(dayOfTask(b))).forEach(task => {
    rows.push([dayOfTask(task), task.title, task.category || "", task.priority || "", task.done ? "Done" : "Not done", Math.round((task.elapsedSeconds || 0) / 60)]);
  });
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadWeeklyCsv(summary, startKey) {
  downloadBlob(new Blob(["\uFEFF", weeklyCsv(summary)], { type: "text/csv;charset=utf-8" }), `kinda-week-${startKey}.csv`);
}

// ---- PDF ----
const safe = text => String(text ?? "").replace(/[^\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "").trim();

export async function buildWeeklyPdf({ summary, startKey, userName }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 48;
  const ink = [36, 36, 36];
  const muted = [128, 120, 112];
  const accent = [217, 108, 59];
  const line = [228, 222, 214];
  let y = margin;

  const ensure = needed => { if (y + needed > height - margin) { doc.addPage(); y = margin; } };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...ink);
  doc.text("kinda", margin, y + 20);
  doc.setTextColor(...accent);
  doc.text(".", margin + doc.getTextWidth("kinda"), y + 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("WEEKLY SUMMARY", width - margin, y + 8, { align: "right" });
  doc.setFontSize(11);
  doc.setTextColor(...ink);
  doc.text(rangeLabel(startKey), width - margin, y + 24, { align: "right" });
  y += 44;
  doc.setDrawColor(...line);
  doc.line(margin, y, width - margin, y);
  y += 26;

  const owner = safe(userName);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...ink);
  doc.text(owner ? `${owner}’s week` : "Your week", margin, y);
  y += 24;

  // stat boxes
  const stats = [
    ["Completion", `${summary.completion}%`],
    ["Done", String(summary.done.length)],
    ["Not done", String(summary.open.length)],
    ["Focus time", summary.focusSeconds ? formatMinutes(Math.round(summary.focusSeconds / 60)) : "0 min"]
  ];
  const gap = 10;
  const boxWidth = (width - margin * 2 - gap * 3) / 4;
  stats.forEach(([label, value], index) => {
    const x = margin + index * (boxWidth + gap);
    doc.setDrawColor(...line);
    doc.setFillColor(251, 249, 246);
    doc.roundedRect(x, y, boxWidth, 62, 6, 6, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text(label.toUpperCase(), x + 12, y + 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...(index === 0 ? accent : ink));
    doc.text(value, x + 12, y + 46);
  });
  y += 86;

  // bar chart
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...ink);
  doc.text("Day by day", margin, y);
  y += 14;
  const chartHeight = 96;
  const maxCount = Math.max(1, ...summary.days.map(day => day.done + day.open));
  const columnWidth = (width - margin * 2) / 7;
  const barWidth = Math.min(34, columnWidth - 22);
  summary.days.forEach((day, index) => {
    const x = margin + index * columnWidth + (columnWidth - barWidth) / 2;
    const base = y + chartHeight;
    const doneHeight = (day.done / maxCount) * (chartHeight - 14);
    const openHeight = (day.open / maxCount) * (chartHeight - 14);
    doc.setFillColor(238, 233, 226);
    doc.rect(x, base - 3, barWidth, 3, "F");
    if (day.done) { doc.setFillColor(...accent); doc.roundedRect(x, base - doneHeight, barWidth, doneHeight, 2, 2, "F"); }
    if (day.open) { doc.setFillColor(223, 216, 207); doc.roundedRect(x, base - doneHeight - openHeight, barWidth, openHeight, 2, 2, "F"); }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text(day.label, x + barWidth / 2, base + 13, { align: "center" });
    if (day.done + day.open) {
      doc.setTextColor(...ink);
      doc.text(`${day.done}/${day.done + day.open}`, x + barWidth / 2, base - doneHeight - openHeight - 5, { align: "center" });
    }
  });
  y += chartHeight + 20;
  doc.setFillColor(...accent);
  doc.rect(margin, y, 8, 8, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...muted);
  doc.text("Done", margin + 13, y + 7);
  doc.setFillColor(223, 216, 207);
  doc.rect(margin + 56, y, 8, 8, "F");
  doc.text("Not done", margin + 69, y + 7);
  y += 30;

  // task lists
  const dayName = task => parseYmd(dayOfTask(task)).toLocaleDateString("en-US", { weekday: "short" });
  const drawList = (title, tasks, done) => {
    ensure(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...ink);
    doc.text(`${title} (${tasks.length})`, margin, y);
    y += 8;
    doc.setDrawColor(...line);
    doc.line(margin, y, width - margin, y);
    y += 16;
    if (!tasks.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...muted);
      doc.text(done ? "Nothing finished yet this week." : "Everything was finished. Nice work!", margin, y);
      y += 24;
      return;
    }
    tasks.forEach(task => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      const lines = doc.splitTextToSize(safe(task.title) || "Untitled task", width - margin * 2 - 20 - 170);
      ensure(lines.length * 13 + 8);
      doc.setDrawColor(...(done ? accent : muted));
      doc.setLineWidth(1.1);
      doc.roundedRect(margin, y - 8, 10, 10, 2, 2, done ? "S" : "S");
      if (done) {
        doc.setDrawColor(...accent);
        doc.line(margin + 2.2, y - 3, margin + 4.4, y - 0.8);
        doc.line(margin + 4.4, y - 0.8, margin + 8, y - 6.4);
      }
      doc.setLineWidth(0.6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(...(done ? muted : ink));
      doc.text(lines, margin + 20, y);
      const meta = [safe(task.category), dayName(task), task.elapsedSeconds ? formatMinutes(Math.round(task.elapsedSeconds / 60)) : ""].filter(Boolean).join("  ·  ");
      doc.setFontSize(8.5);
      doc.setTextColor(...muted);
      doc.text(meta, width - margin, y, { align: "right" });
      y += lines.length * 13 + 5;
    });
    y += 14;
  };
  drawList("Completed", summary.done, true);
  drawList("Not finished", summary.open, false);

  // footer on every page
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(`Generated by Kinda on ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, margin, height - 26);
    doc.text(`${page} / ${pages}`, width - margin, height - 26, { align: "right" });
  }
  return doc;
}

export async function downloadWeeklyPdf(args) {
  const doc = await buildWeeklyPdf(args);
  doc.save(`kinda-week-${args.startKey}.pdf`);
}

// ---- page ----
export function WeeklyPage({ tasks, userName, onError = () => {} }) {
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const startKey = weekStartKey(offset);
  const summary = useMemo(() => summarizeWeek(tasks, startKey), [tasks, startKey]);
  const maxCount = Math.max(1, ...summary.days.map(day => day.done + day.open));
  const todayKey = ymd(new Date());

  async function pdf() {
    setBusy(true);
    try { await downloadWeeklyPdf({ summary, startKey, userName }); } catch (error) { onError(error.message || "Couldn't create the PDF."); }
    setBusy(false);
  }

  return <div className="page-content weekly-page">
    <header className="page-header"><div><p className="eyebrow">YOUR WEEK AT A GLANCE</p><h1>Weekly summary</h1><p className="page-description">What got done, and what is still waiting.</p></div>
      <div className="weekly-actions"><button className="button button-secondary" onClick={() => downloadWeeklyCsv(summary, startKey)} disabled={!summary.total}><FileSpreadsheet size={15}/> CSV</button><button className="button button-primary" onClick={pdf} disabled={busy || !summary.total}><Download size={15}/> {busy ? "Preparing…" : "Download PDF"}</button></div></header>
    <div className="week-nav"><button className="icon-quiet" aria-label="Previous week" onClick={() => setOffset(value => value - 1)}><ArrowLeft size={17}/></button><div><b>{rangeLabel(startKey)}</b><small>{offset === 0 ? "This week" : offset === -1 ? "Last week" : `${-offset} weeks ago`}</small></div><button className="icon-quiet" aria-label="Next week" disabled={offset >= 0} onClick={() => setOffset(value => Math.min(0, value + 1))}><ArrowRight size={17}/></button></div>
    {summary.total === 0
      ? <div className="page-empty"><FileText size={22}/><h2>No tasks this week.</h2><p>Tasks you plan for this week will be summarised here, ready to download.</p></div>
      : <>
        <section className="week-stats" aria-label="Week totals">
          <div className="week-stat week-stat-main"><small>Completion</small><b>{summary.completion}<i>%</i></b><span className="week-meter"><span style={{ width: `${summary.completion}%` }}/></span></div>
          <div className="week-stat"><small>Done</small><b>{summary.done.length}</b></div>
          <div className="week-stat"><small>Not done</small><b>{summary.open.length}</b></div>
          <div className="week-stat"><small>Focus time</small><b>{summary.focusSeconds ? formatMinutes(Math.round(summary.focusSeconds / 60)) : "0 min"}</b></div>
        </section>
        {summary.bestDay && <p className="week-note">Your best day was <b>{parseYmd(summary.bestDay.key).toLocaleDateString("en-US", { weekday: "long" })}</b> with {summary.bestDay.done} {summary.bestDay.done === 1 ? "task" : "tasks"} done.</p>}
        <section className="week-chart" aria-label="Tasks by day">
          {summary.days.map(day => <div className={`week-col ${day.key === todayKey ? "today" : ""}`} key={day.key}>
            <span className="week-bar-count">{day.done + day.open ? `${day.done}/${day.done + day.open}` : ""}</span>
            <div className="week-bar" title={`${day.label}: ${day.done} done, ${day.open} not done`}><span className="week-bar-open" style={{ height: `${(day.open / maxCount) * 100}%` }}/><span className="week-bar-done" style={{ height: `${(day.done / maxCount) * 100}%` }}/></div>
            <small>{day.label}</small>
          </div>)}
        </section>
        <div className="week-legend"><span><i className="dot-done"/> Done</span><span><i className="dot-open"/> Not done</span></div>
        <div className="week-lists">
          <section><h2>Completed <small>{summary.done.length}</small></h2>{summary.done.length ? <ul>{summary.done.map(task => <li key={task.id}><span className="week-check">✓</span><span><b>{task.title}</b><small>{task.category} · {parseYmd(dayOfTask(task)).toLocaleDateString("en-US", { weekday: "short" })}</small></span></li>)}</ul> : <p className="week-empty">Nothing finished yet.</p>}</section>
          <section><h2>Not finished <small>{summary.open.length}</small></h2>{summary.open.length ? <ul>{summary.open.map(task => <li key={task.id}><span className="week-check open"/><span><b>{task.title}</b><small>{task.category} · {parseYmd(dayOfTask(task)).toLocaleDateString("en-US", { weekday: "short" })}</small></span></li>)}</ul> : <p className="week-empty">Everything was finished. Nice work!</p>}</section>
        </div>
      </>}
  </div>;
}
