import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Download, FileSpreadsheet, FileText, Share } from "lucide-react";
import { shareProgressCard, kindleDataUrl } from "./share.js";

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
const weekdayShort = key => parseYmd(key).toLocaleDateString("en-US", { weekday: "short" });
const weekdayLong = key => parseYmd(key).toLocaleDateString("en-US", { weekday: "long" });

// ---- summary ----
// A task that was moved to another day without being finished still counts as "not done" on the day it was
// first planned, so a past week never looks better than it was.
export function taskEntries(task) {
  const day = dayOfTask(task);
  const entries = [];
  for (const from of task.movedFrom || []) {
    if (from !== day) entries.push({ task, day: from, status: "moved", movedTo: day });
  }
  entries.push({ task, day, status: task.done ? "done" : "open", movedTo: null });
  return entries;
}

export function summarizeWeek(tasks, startKey) {
  const keys = Array.from({ length: 7 }, (_, index) => addDays(startKey, index));
  const days = keys.map(key => ({ key, label: weekdayShort(key), done: 0, open: 0 }));
  const inWeek = tasks.flatMap(taskEntries).filter(entry => keys.includes(entry.day));
  inWeek.forEach(entry => {
    const day = days[keys.indexOf(entry.day)];
    if (entry.status === "done") day.done += 1; else day.open += 1;
  });
  const byDay = (a, b) => a.day.localeCompare(b.day);
  const done = inWeek.filter(entry => entry.status === "done").sort(byDay);
  const open = inWeek.filter(entry => entry.status !== "done").sort(byDay);
  const seenTasks = new Set();
  let focusSeconds = 0;
  inWeek.forEach(entry => {
    if (entry.status === "moved" || seenTasks.has(entry.task.id)) return;
    seenTasks.add(entry.task.id);
    focusSeconds += entry.task.elapsedSeconds || 0;
  });
  const best = days.reduce((top, day) => (day.done > (top ? top.done : 0) ? day : top), null);
  return {
    days, total: inWeek.length, done, open, focusSeconds,
    moved: inWeek.filter(entry => entry.status === "moved").length,
    completion: inWeek.length ? Math.round((done.length / inWeek.length) * 100) : 0,
    bestDay: best && best.done > 0 ? best : null
  };
}

// ---- CSV ----
function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
const statusText = entry => (entry.status === "done" ? "Done" : entry.status === "moved" ? `Not done (moved to ${entry.movedTo})` : "Not done");

export function weeklyCsv(summary) {
  const rows = [["Date", "Task", "Category", "Priority", "Status", "Focus minutes"]];
  [...summary.done, ...summary.open].sort((a, b) => a.day.localeCompare(b.day)).forEach(entry => {
    rows.push([entry.day, entry.task.title, entry.task.category || "", entry.task.priority || "", statusText(entry), entry.status === "moved" ? 0 : Math.round((entry.task.elapsedSeconds || 0) / 60)]);
  });
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}
export function circleWeeklyCsv(data) {
  const rows = [["Member", "Date", "Task", "Category", "Status"]];
  [...data.rows].sort((a, b) => a.member.localeCompare(b.member) || a.day.localeCompare(b.day)).forEach(row => {
    rows.push([row.member, row.day, row.title, row.category || "", statusText(row)]);
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
const INK = [36, 36, 36];
const MUTED = [128, 120, 112];
const ACCENT = [194, 90, 44];
const RULE = [228, 222, 214];

function pdfFrame(doc, subtitle, rangeText) {
  const width = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...INK);
  doc.text("kinda", margin, y + 20);
  const wordWidth = doc.getTextWidth("kinda");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(subtitle, width - margin, y + 8, { align: "right" });
  const subtitleWidth = doc.getTextWidth(subtitle);
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(rangeText, width - margin, y + 24, { align: "right" });
  const rangeWidth = doc.getTextWidth(rangeText);
  try {
    // Kindle replaces the dot after "kinda" and waves from the corner.
    const dot = kindleDataUrl("happy", 160);
    if (dot) doc.addImage(dot, "PNG", margin + wordWidth + 2, y - 3, 22, 25);
    const mascot = kindleDataUrl("cheer", 240);
    if (mascot) doc.addImage(mascot, "PNG", width - margin - Math.max(subtitleWidth, rangeWidth) - 52, y - 2, 40, 46);
  } catch {
    doc.setTextColor(...ACCENT);
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.text(".", margin + wordWidth, y + 20);
  }
  y += 44;
  doc.setDrawColor(...RULE);
  doc.line(margin, y, width - margin, y);
  return y + 26;
}
function pdfStats(doc, y, stats) {
  const width = doc.internal.pageSize.getWidth();
  const margin = 48;
  const gap = 10;
  const boxWidth = (width - margin * 2 - gap * (stats.length - 1)) / stats.length;
  stats.forEach(([label, value], index) => {
    const x = margin + index * (boxWidth + gap);
    doc.setDrawColor(...RULE);
    doc.setFillColor(251, 249, 246);
    doc.roundedRect(x, y, boxWidth, 62, 6, 6, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x + 12, y + 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...(index === 0 ? ACCENT : INK));
    doc.text(value, x + 12, y + 46);
  });
  return y + 86;
}
function pdfFooter(doc) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Generated by Kinda on ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, 48, height - 26);
    doc.text(`${page} / ${pages}`, width - 48, height - 26, { align: "right" });
  }
}
function pdfCheck(doc, x, y, done) {
  doc.setDrawColor(...(done ? ACCENT : MUTED));
  doc.setLineWidth(1.1);
  doc.roundedRect(x, y - 8, 10, 10, 2, 2, "S");
  if (done) {
    doc.line(x + 2.2, y - 3, x + 4.4, y - 0.8);
    doc.line(x + 4.4, y - 0.8, x + 8, y - 6.4);
  }
  doc.setLineWidth(0.6);
}

export async function buildWeeklyPdf({ summary, startKey, userName }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = pdfFrame(doc, "WEEKLY SUMMARY", rangeLabel(startKey));
  const ensure = needed => { if (y + needed > height - margin) { doc.addPage(); y = margin; } };

  const owner = safe(userName);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text(owner ? `${owner}’s week` : "Your week", margin, y);
  y += 24;
  y = pdfStats(doc, y, [
    ["Completion", `${summary.completion}%`],
    ["Done", String(summary.done.length)],
    ["Not done", String(summary.open.length)],
    ["Focus time", summary.focusSeconds ? formatMinutes(Math.round(summary.focusSeconds / 60)) : "0 min"]
  ]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
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
    if (day.done) { doc.setFillColor(...ACCENT); doc.roundedRect(x, base - doneHeight, barWidth, doneHeight, 2, 2, "F"); }
    if (day.open) { doc.setFillColor(223, 216, 207); doc.roundedRect(x, base - doneHeight - openHeight, barWidth, openHeight, 2, 2, "F"); }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(day.label, x + barWidth / 2, base + 13, { align: "center" });
    if (day.done + day.open) {
      doc.setTextColor(...INK);
      doc.text(`${day.done}/${day.done + day.open}`, x + barWidth / 2, base - doneHeight - openHeight - 5, { align: "center" });
    }
  });
  y += chartHeight + 20;
  doc.setFillColor(...ACCENT);
  doc.rect(margin, y, 8, 8, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text("Done", margin + 13, y + 7);
  doc.setFillColor(223, 216, 207);
  doc.rect(margin + 56, y, 8, 8, "F");
  doc.text("Not done", margin + 69, y + 7);
  y += 30;

  const drawList = (title, entries, done) => {
    ensure(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(`${title} (${entries.length})`, margin, y);
    y += 8;
    doc.setDrawColor(...RULE);
    doc.line(margin, y, width - margin, y);
    y += 16;
    if (!entries.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      doc.text(done ? "Nothing finished yet this week." : "Everything was finished. Nice work!", margin, y);
      y += 24;
      return;
    }
    entries.forEach(entry => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      const lines = doc.splitTextToSize(safe(entry.task.title) || "Untitled task", width - margin * 2 - 20 - 190);
      ensure(lines.length * 13 + 8);
      pdfCheck(doc, margin, y, done);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(...(done ? MUTED : INK));
      doc.text(lines, margin + 20, y);
      const meta = [safe(entry.task.category), weekdayShort(entry.day), entry.status === "moved" ? `moved to ${weekdayShort(entry.movedTo)}` : "", entry.status !== "moved" && entry.task.elapsedSeconds ? formatMinutes(Math.round(entry.task.elapsedSeconds / 60)) : ""].filter(Boolean).join("  ·  ");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(meta, width - margin, y, { align: "right" });
      y += lines.length * 13 + 5;
    });
    y += 14;
  };
  drawList("Completed", summary.done, true);
  drawList("Not finished", summary.open, false);
  pdfFooter(doc);
  return doc;
}

export async function downloadWeeklyPdf(args) {
  const doc = await buildWeeklyPdf(args);
  doc.save(`kinda-week-${args.startKey}.pdf`);
}

export async function buildCircleWeeklyPdf({ data, startKey }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = pdfFrame(doc, "CIRCLE WEEKLY REPORT", rangeLabel(startKey));
  const ensure = needed => { if (y + needed > height - margin) { doc.addPage(); y = margin; } };
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text(safe(data.circleName) || "Circle", margin, y);
  y += 24;
  y = pdfStats(doc, y, [
    ["Completion", `${data.totals.completion}%`],
    ["Done", String(data.totals.done)],
    ["Not done", String(data.totals.open)],
    ["Members", String(data.members.length)]
  ]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text("By member", margin, y);
  y += 12;
  const barWidth = 150;
  data.members.forEach(member => {
    ensure(26);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(safe(member.name) || "Member", margin, y + 12);
    doc.setFillColor(238, 233, 226);
    doc.roundedRect(width - margin - barWidth - 120, y + 3, barWidth, 8, 3, 3, "F");
    if (member.completion > 0) {
      doc.setFillColor(...ACCENT);
      doc.roundedRect(width - margin - barWidth - 120, y + 3, Math.max(6, (barWidth * member.completion) / 100), 8, 3, 3, "F");
    }
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(member.total ? `${member.completion}%  ·  ${member.done} of ${member.total} done` : "No tasks", width - margin, y + 11, { align: "right" });
    y += 26;
  });
  y += 24;

  const notFinished = data.rows.filter(row => row.status !== "done");
  ensure(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(`Not finished (${notFinished.length})`, margin, y);
  y += 8;
  doc.setDrawColor(...RULE);
  doc.line(margin, y, width - margin, y);
  y += 16;
  if (!notFinished.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("Everyone finished everything. Nice work!", margin, y);
    y += 20;
  }
  const byMember = new Map();
  notFinished.forEach(row => { if (!byMember.has(row.memberId)) byMember.set(row.memberId, []); byMember.get(row.memberId).push(row); });
  byMember.forEach(rows => {
    ensure(34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...ACCENT);
    doc.text(safe(rows[0].member) || "Member", margin, y);
    y += 14;
    rows.sort((a, b) => a.day.localeCompare(b.day)).forEach(row => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(safe(row.title) || "Untitled task", width - margin * 2 - 20 - 150);
      ensure(lines.length * 12 + 6);
      pdfCheck(doc, margin, y, false);
      doc.setTextColor(...INK);
      doc.text(lines, margin + 20, y);
      const meta = [weekdayShort(row.day), row.status === "moved" ? `moved to ${weekdayShort(row.movedTo)}` : ""].filter(Boolean).join("  ·  ");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(meta, width - margin, y, { align: "right" });
      y += lines.length * 12 + 5;
    });
    y += 8;
  });
  pdfFooter(doc);
  return doc;
}

export async function downloadCircleWeeklyPdf(args) {
  const doc = await buildCircleWeeklyPdf(args);
  doc.save(`kinda-circle-${safe(args.data.circleName).toLowerCase().replace(/[^a-z0-9]+/g, "-") || "report"}-${args.startKey}.pdf`);
}

// ---- pages ----
function entryLabel(entry) {
  return entry.status === "moved" ? `Moved to ${weekdayShort(entry.movedTo)}` : "";
}

export function WeeklyPage({ tasks, userName, onError = () => {}, api = null }) {
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState({});
  const startKey = weekStartKey(offset);
  // The app only keeps the last ~35 days of tasks in memory to save data, so
  // older weeks are fetched one at a time when someone navigates back to them.
  const needsHistory = startKey < addDays(ymd(new Date()), -30);
  useEffect(() => {
    if (!api || !needsHistory || history[startKey]) return undefined;
    let cancelled = false;
    api(`/tasks?since=${startKey}&until=${addDays(startKey, 42)}`)
      .then(rows => { if (!cancelled) setHistory(current => ({ ...current, [startKey]: rows })); })
      .catch(error => { if (!cancelled) onError(error.message || "Couldn't load that week."); });
    return () => { cancelled = true; };
  }, [api, needsHistory, startKey]);
  const weekTasks = useMemo(() => {
    const older = history[startKey];
    if (!older) return tasks;
    const known = new Set(tasks.map(task => task.id));
    return [...tasks, ...older.filter(task => !known.has(task.id))];
  }, [tasks, history, startKey]);
  const summary = useMemo(() => summarizeWeek(weekTasks, startKey), [weekTasks, startKey]);
  const maxCount = Math.max(1, ...summary.days.map(day => day.done + day.open));
  const todayKey = ymd(new Date());

  async function pdf() {
    setBusy(true);
    try { await downloadWeeklyPdf({ summary, startKey, userName }); } catch (error) { onError(error.message || "Couldn't create the PDF."); }
    setBusy(false);
  }

  async function shareCard() {
    try {
      await shareProgressCard({
        title: "My week, in progress",
        subtitle: rangeLabel(startKey),
        filename: `kinda-week-${startKey}.png`,
        mood: "proud",
        stats: [
          { value: `${summary.completion}%`, label: "weekly completion" },
          { value: summary.done.length, label: "tasks completed" },
          { value: summary.open.length, label: "still in progress" },
          { value: formatMinutes(Math.round(summary.focusSeconds / 60)), label: "focus time" }
        ]
      });
    } catch (error) { onError(error.message || "Couldn't share the weekly card."); }
  }

  return <div className="page-content weekly-page">
    <header className="page-header"><div><p className="eyebrow">Your week at a glance</p><h1>Weekly summary</h1><p className="page-description">What got done, and what is still waiting.</p></div>
      <div className="weekly-actions"><button className="button button-secondary" onClick={shareCard} disabled={!summary.total}><Share size={15}/> Share card</button><button className="button button-secondary" onClick={() => downloadWeeklyCsv(summary, startKey)} disabled={!summary.total}><FileSpreadsheet size={15}/> CSV</button><button className="button button-primary" onClick={pdf} disabled={busy || !summary.total}><Download size={15}/> {busy ? "Preparing…" : "Download PDF"}</button></div></header>
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
        {summary.moved > 0 && <p className="week-note">{summary.moved} {summary.moved === 1 ? "task was" : "tasks were"} moved to another day. They still count as not done on the day you planned them.</p>}
        {summary.bestDay && <p className="week-note">Your best day was <b>{weekdayLong(summary.bestDay.key)}</b> with {summary.bestDay.done} {summary.bestDay.done === 1 ? "task" : "tasks"} done.</p>}
        <section className="week-chart" aria-label="Tasks by day">
          {summary.days.map(day => <div className={`week-col ${day.key === todayKey ? "today" : ""}`} key={day.key}>
            <span className="week-bar-count">{day.done + day.open ? `${day.done}/${day.done + day.open}` : ""}</span>
            <div className="week-bar" title={`${day.label}: ${day.done} done, ${day.open} not done`}><span className="week-bar-open" style={{ height: `${(day.open / maxCount) * 100}%` }}/><span className="week-bar-done" style={{ height: `${(day.done / maxCount) * 100}%` }}/></div>
            <small>{day.label}</small>
          </div>)}
        </section>
        <div className="week-legend"><span><i className="dot-done"/> Done</span><span><i className="dot-open"/> Not done</span></div>
        <div className="week-lists">
          <section><h2>Completed <small>{summary.done.length}</small></h2>{summary.done.length ? <ul>{summary.done.map(entry => <li key={`${entry.task.id}-${entry.day}-done`}><span className="week-check">✓</span><span><b>{entry.task.title}</b><small>{entry.task.category} · {weekdayShort(entry.day)}</small></span></li>)}</ul> : <p className="week-empty">Nothing finished yet.</p>}</section>
          <section><h2>Not finished <small>{summary.open.length}</small></h2>{summary.open.length ? <ul>{summary.open.map(entry => <li key={`${entry.task.id}-${entry.day}-${entry.status}`}><span className="week-check open"/><span><b>{entry.task.title}</b><small>{entry.task.category} · {weekdayShort(entry.day)}{entryLabel(entry) ? ` · ${entryLabel(entry)}` : ""}</small></span></li>)}</ul> : <p className="week-empty">Everything was finished. Nice work!</p>}</section>
        </div>
      </>}
  </div>;
}

// Weekly report for a whole circle. Only owners and admins can open it; it covers the tasks shared with the circle.
export function CircleWeeklyPanel({ fetchWeek, onError = () => {} }) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const startKey = weekStartKey(offset);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    fetchWeek(startKey).then(result => { if (!cancelled) setData(result); }).catch(error => { if (!cancelled) { setFailed(true); onError(error.message || "Couldn't load the report."); } });
    return () => { cancelled = true; };
  }, [startKey]);

  async function pdf() {
    setBusy(true);
    try { await downloadCircleWeeklyPdf({ data, startKey }); } catch (error) { onError(error.message || "Couldn't create the PDF."); }
    setBusy(false);
  }

  return <div className="circle-weekly">
    <div className="week-nav"><button className="icon-quiet" aria-label="Previous week" onClick={() => setOffset(value => value - 1)}><ArrowLeft size={17}/></button><div><b>{rangeLabel(startKey)}</b><small>{offset === 0 ? "This week" : offset === -1 ? "Last week" : `${-offset} weeks ago`}</small></div><button className="icon-quiet" aria-label="Next week" disabled={offset >= 0} onClick={() => setOffset(value => Math.min(0, value + 1))}><ArrowRight size={17}/></button></div>
    {failed ? <p className="week-empty">The report couldn’t be loaded. Try another week or reopen this window.</p>
      : !data ? <div className="skeleton-list"><div className="skeleton-row"><div><span className="skeleton skeleton-line"/><span className="skeleton skeleton-line short"/></div></div></div>
      : data.totals.total === 0 ? <p className="week-empty">No shared tasks were planned this week.</p>
      : <>
        <section className="week-stats" aria-label="Circle totals">
          <div className="week-stat week-stat-main"><small>Completion</small><b>{data.totals.completion}<i>%</i></b><span className="week-meter"><span style={{ width: `${data.totals.completion}%` }}/></span></div>
          <div className="week-stat"><small>Done</small><b>{data.totals.done}</b></div>
          <div className="week-stat"><small>Not done</small><b>{data.totals.open}</b></div>
        </section>
        <ul className="circle-week-members">{data.members.map(member => <li key={member.id}><span className="cwm-name">{member.name}</span><span className="cwm-bar"><span style={{ width: `${member.completion}%` }}/></span><span className="cwm-count">{member.total ? `${member.done}/${member.total}` : "–"}</span></li>)}</ul>
      </>}
    <div className="weekly-actions circle-weekly-actions"><button className="button button-secondary" onClick={() => downloadBlob(new Blob(["\uFEFF", circleWeeklyCsv(data)], { type: "text/csv;charset=utf-8" }), `kinda-circle-${startKey}.csv`)} disabled={!data || !data.totals.total}><FileSpreadsheet size={15}/> CSV</button><button className="button button-primary" onClick={pdf} disabled={!data || !data.totals.total || busy}><Download size={15}/> {busy ? "Preparing…" : "Download PDF"}</button></div>
  </div>;
}
