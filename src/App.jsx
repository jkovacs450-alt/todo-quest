import React, { useEffect, useMemo, useRef, useState } from "react";

const LS_KEY = "todoquest_v1";

const DIFFICULTY_XP = { easy: 10, medium: 20, hard: 40 };
const PRIORITY_LABEL = { low: "Low", normal: "Normal", high: "High" };

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function startOfDay(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function fmtDateInput(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function parseDateInput(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  dt.setHours(23, 59, 59, 999);
  return dt.getTime();
}

function levelFromXP(totalXP) {
  let level = 1;
  let xp = totalXP;
  while (true) {
    const req = 100 + (level - 1) * 25;
    if (xp >= req) {
      xp -= req;
      level += 1;
      if (level > 999) break;
    } else {
      return { level, xpIntoLevel: xp, xpForNext: req };
    }
  }
  return { level: 999, xpIntoLevel: 0, xpForNext: 1 };
}

function makeDefaultState() {
  const now = Date.now();
  return {
    profile: { name: "Player", title: "Rookie", color: "#7c3aed" },
    stats: { totalXP: 0, streakDays: 0, lastCompleteDay: null, totalCompleted: 0 },
    settings: { sound: true, reduceMotion: false },
    todos: [
      {
        id: uid(),
        text: "Erstes Quest: Schreib eine Aufgabe rein ✍️",
        done: false,
        createdAt: now,
        completedAt: null,
        dueAt: parseDateInput(fmtDateInput(now + 24 * 3600 * 1000)),
        priority: "normal",
        difficulty: "easy",
        tags: ["start"],
        notes: "Tipp: Schwierigkeit bestimmt XP."
      },
      {
        id: uid(),
        text: "Mach was Kleines fertig und kassier XP ✅",
        done: false,
        createdAt: now,
        completedAt: null,
        dueAt: null,
        priority: "low",
        difficulty: "easy",
        tags: ["xp"],
        notes: "Du bekommst auch Bonus für Tages-Serie (Streak)."
      }
    ],
    achievements: {
      first_done: false,
      streak_3: false,
      streak_7: false,
      completed_10: false,
      completed_50: false,
      level_5: false,
      level_10: false
    },
    ui: { toast: null, lastUndo: null }
  };
}

function playDing(enabled) {
  if (!enabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    o.start();
    o.stop(ctx.currentTime + 0.22);
    o.onended = () => ctx.close();
  } catch {}
}

function Badge({ children, tone = "neutral" }) {
  const cls =
    tone === "green"
      ? "badge badgeGreen"
      : tone === "amber"
      ? "badge badgeAmber"
      : tone === "red"
      ? "badge badgeRed"
      : tone === "violet"
      ? "badge badgeViolet"
      : "badge";
  return <span className={cls}>{children}</span>;
}

function Modal({ open, title, children, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modalBack" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modalHead">
          <div style={{ fontWeight: 800 }}>{title}</div>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}

function ProgressBar({ value, max, label }) {
  const pct = max <= 0 ? 0 : clamp((value / max) * 100, 0, 100);
  return (
    <div>
      <div className="space small" style={{ marginBottom: 6 }}>
        <span>{label}</span>
        <span>
          {value}/{max}
        </span>
      </div>
      <div className="progressOuter">
        <div className="progressInner" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AchievementCard({ title, desc, unlocked }) {
  return (
    <div className="card" style={{ background: unlocked ? "#ecfdf5" : "white", borderColor: unlocked ? "#a7f3d0" : "#e4e4e7" }}>
      <div className="space">
        <div>
          <div style={{ fontWeight: 800 }}>{title}</div>
          <div className="small" style={{ marginTop: 6 }}>
            {desc}
          </div>
        </div>
        <div>{unlocked ? <Badge tone="green">Unlocked</Badge> : <Badge>Locked</Badge>}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return makeDefaultState();
      const parsed = JSON.parse(raw);
      const def = makeDefaultState();
      return {
        ...def,
        ...parsed,
        profile: { ...def.profile, ...(parsed.profile || {}) },
        stats: { ...def.stats, ...(parsed.stats || {}) },
        settings: { ...def.settings, ...(parsed.settings || {}) },
        achievements: { ...def.achievements, ...(parsed.achievements || {}) },
        ui: { ...def.ui, ...(parsed.ui || {}) },
        todos: Array.isArray(parsed.todos) ? parsed.todos : def.todos
      };
    } catch {
      return makeDefaultState();
    }
  });

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | active | done | today | overdue
  const [sort, setSort] = useState("smart"); // smart | due | created | priority
  const [showGame, setShowGame] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [achOpen, setAchOpen] = useState(false);

  const [newText, setNewText] = useState("");
  const newInputRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", state.profile.color);
  }, [state.profile.color]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        newInputRef.current?.focus?.();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (state.ui.lastUndo) {
          e.preventDefault();
          undo();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ui.lastUndo]);

  useEffect(() => {
    if (!state.ui.toast) return;
    const t = setTimeout(() => setState((s) => ({ ...s, ui: { ...s.ui, toast: null } })), 2800);
    return () => clearTimeout(t);
  }, [state.ui.toast]);

  const levelInfo = useMemo(() => levelFromXP(state.stats.totalXP), [state.stats.totalXP]);

  const today0 = startOfDay();
  const tomorrow0 = today0 + 24 * 3600 * 1000;

  const activeCount = useMemo(() => state.todos.filter((t) => !t.done).length, [state.todos]);

  const doneTodayCount = useMemo(() => {
    return state.todos.filter((t) => t.done && t.completedAt && startOfDay(t.completedAt) === today0).length;
  }, [state.todos, today0]);

  function toast(msg) {
    setState((s) => ({ ...s, ui: { ...s.ui, toast: msg } }));
  }

  function snapshotForUndo(nextState, label = "Undo") {
    setState((s) => ({
      ...nextState,
      ui: { ...nextState.ui, lastUndo: { label, prev: s, at: Date.now() } }
    }));
  }

  function undo() {
    setState((s) => {
      if (!s.ui.lastUndo?.prev) return s;
      return { ...s.ui.lastUndo.prev, ui: { ...s.ui.lastUndo.prev.ui, toast: "Undone." } };
    });
  }

  function addTodo() {
    const text = newText.trim();
    if (!text) return;
    const now = Date.now();
    const t = {
      id: uid(),
      text,
      done: false,
      createdAt: now,
      completedAt: null,
      dueAt: null,
      priority: "normal",
      difficulty: "easy",
      tags: [],
      notes: ""
    };
    snapshotForUndo({ ...state, todos: [t, ...state.todos] }, "Undo add");
    setNewText("");
    toast("Quest added.");
  }

  function openEdit(id) {
    setEditId(id);
    setEditOpen(true);
  }

  function updateTodo(id, patch) {
    const nextTodos = state.todos.map((t) => (t.id === id ? { ...t, ...patch } : t));
    snapshotForUndo({ ...state, todos: nextTodos }, "Undo edit");
  }

  function deleteTodo(id) {
    snapshotForUndo({ ...state, todos: state.todos.filter((t) => t.id !== id) }, "Undo delete");
    toast("Deleted.");
  }

  function gainXP(baseXP) {
    const now = Date.now();
    const today = startOfDay(now);
    const yesterday = today - 24 * 3600 * 1000;

    let streakDays = state.stats.streakDays || 0;
    const lastDay = state.stats.lastCompleteDay;

    if (lastDay === today) {
      // same day, no change
    } else if (lastDay === yesterday) {
      streakDays += 1;
    } else {
      streakDays = 1;
    }

    const streakBonus = streakDays >= 7 ? 10 : streakDays >= 3 ? 5 : 0;
    const todayBonus = doneTodayCount === 0 ? 5 : 0;

    const totalGain = baseXP + streakBonus + todayBonus;

    const nextStats = {
      ...state.stats,
      totalXP: (state.stats.totalXP || 0) + totalGain,
      streakDays,
      lastCompleteDay: today,
      totalCompleted: (state.stats.totalCompleted || 0) + 1
    };

    const next = { ...state, stats: nextStats };

    const leveled = levelFromXP(nextStats.totalXP).level;
    const ach = { ...state.achievements };
    if (!ach.first_done) ach.first_done = true;
    if (streakDays >= 3) ach.streak_3 = true;
    if (streakDays >= 7) ach.streak_7 = true;
    if (nextStats.totalCompleted >= 10) ach.completed_10 = true;
    if (nextStats.totalCompleted >= 50) ach.completed_50 = true;
    if (leveled >= 5) ach.level_5 = true;
    if (leveled >= 10) ach.level_10 = true;

    const title =
      leveled >= 10 ? "Legend" : leveled >= 7 ? "Pro" : leveled >= 5 ? "Adventurer" : leveled >= 3 ? "Apprentice" : "Rookie";

    next.profile = { ...next.profile, title };
    next.achievements = ach;

    setState(next);

    playDing(state.settings.sound);
    toast(`+${totalGain} XP (base ${baseXP} + bonus ${streakBonus + todayBonus})`);
  }

  function toggleDone(id) {
    const t = state.todos.find((x) => x.id === id);
    if (!t) return;

    if (!t.done) {
      const baseXP = DIFFICULTY_XP[t.difficulty] || 10;
      snapshotForUndo(
        { ...state, todos: state.todos.map((x) => (x.id === id ? { ...x, done: true, completedAt: Date.now() } : x)) },
        "Undo complete"
      );
      gainXP(baseXP);
    } else {
      snapshotForUndo(
        { ...state, todos: state.todos.map((x) => (x.id === id ? { ...x, done: false, completedAt: null } : x)) },
        "Undo uncomplete"
      );
      toast("Marked as active.");
    }
  }

  function resetAll() {
    snapshotForUndo(makeDefaultState(), "Undo reset");
    toast("Reset done.");
  }

  const editTodo = useMemo(() => state.todos.find((t) => t.id === editId) || null, [state.todos, editId]);

  const overdueActive = useMemo(() => {
    const now = Date.now();
    return state.todos.filter((t) => !t.done && t.dueAt && t.dueAt < now).length;
  }, [state.todos]);

  const todosFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...state.todos];

    if (q) {
      list = list.filter((t) => [t.text, t.notes, ...(t.tags || [])].join(" ").toLowerCase().includes(q));
    }

    if (filter === "active") list = list.filter((t) => !t.done);
    if (filter === "done") list = list.filter((t) => t.done);

    if (filter === "today") {
      list = list.filter((t) => t.dueAt && t.dueAt >= today0 && t.dueAt < tomorrow0);
    }

    if (filter === "overdue") {
      list = list.filter((t) => !t.done && t.dueAt && t.dueAt < Date.now());
    }

    const priScore = { high: 3, normal: 2, low: 1 };
    const smartScore = (t) => {
      let s = 0;
      if (!t.done) s += 50;
      s += (priScore[t.priority] || 2) * 10;
      if (t.dueAt) {
        const delta = t.dueAt - Date.now();
        if (delta < 0) s += 40;
        else if (delta < 24 * 3600 * 1000) s += 25;
        else if (delta < 3 * 24 * 3600 * 1000) s += 15;
      }
      s += t.difficulty === "hard" ? 6 : t.difficulty === "medium" ? 3 : 1;
      return s;
    };

    if (sort === "smart") list.sort((a, b) => smartScore(b) - smartScore(a));
    if (sort === "due") list.sort((a, b) => (a.dueAt || Infinity) - (b.dueAt || Infinity));
    if (sort === "created") list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (sort === "priority")
      list.sort((a, b) => (priScore[b.priority] || 2) - (priScore[a.priority] || 2) || (a.dueAt || Infinity) - (b.dueAt || Infinity));

    return list;
  }, [state.todos, query, filter, sort, today0, tomorrow0]);

  return (
    <div className="container">
      <header className="space wrap">
        <div className="row" style={{ gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: "var(--accent)", boxShadow: "0 1px 2px rgba(0,0,0,.1)" }} />
          <div>
            <h1 className="h1">Todo Quest</h1>
            <div className="sub">Mach deine Aufgaben wie ein Game — XP farmen, leveln, chillen.</div>
          </div>
        </div>

        <div className="row wrap">
          <button className="btn" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <button className="btn" onClick={() => setAchOpen(true)}>
            Achievements
          </button>
          <button className="btn" onClick={() => setShowGame((v) => !v)}>
            {showGame ? "Hide" : "Show"} Game HUD
          </button>
        </div>
      </header>

      <div className="grid">
        <div>
          <section className="card">
            <div className="small" style={{ fontWeight: 700 }}>
              New quest (Ctrl/⌘ + K)
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input
                ref={newInputRef}
                className="input"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTodo()}
                placeholder="z.B. Elternbrief schreiben, Frühstück planen, ..."
              />
              <button className="btnPrimary" onClick={addTodo}>
                Add
              </button>
            </div>

            <div className="row wrap" style={{ marginTop: 10 }}>
              <div className="small">Klick auf eine Aufgabe → editieren (Tags, Fälligkeit, Schwierigkeit, Notizen)</div>
              <button className="btn" onClick={undo} disabled={!state.ui.lastUndo} title="Ctrl/⌘+Z">
                Undo
              </button>
            </div>
          </section>

          <section className="card" style={{ marginTop: 16 }}>
            <div className="space wrap">
              <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search (Text, Tags, Notizen)" />
              <div className="row wrap">
                <select className="btn" value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="done">Done</option>
                  <option value="today">Due today</option>
                  <option value="overdue">Overdue</option>
                </select>
                <select className="btn" value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="smart">Smart sort</option>
                  <option value="due">By due date</option>
                  <option value="priority">By priority</option>
                  <option value="created">Newest</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {todosFiltered.length === 0 ? (
                <div className="card" style={{ borderStyle: "dashed", textAlign: "center", color: "#52525b" }}>
                  Nichts gefunden. Vielleicht ein neues Quest adden? 👀
                </div>
              ) : (
                todosFiltered.map((t) => {
                  const isOverdue = !t.done && t.dueAt && t.dueAt < Date.now();
                  const dueLabel = t.dueAt ? new Date(t.dueAt).toLocaleDateString("de-DE") : null;
                  const diffTone = t.difficulty === "hard" ? "red" : t.difficulty === "medium" ? "amber" : "green";
                  const prioTone = t.priority === "high" ? "red" : t.priority === "low" ? "neutral" : "violet";

                  return (
                    <div key={t.id} className={`todo ${t.done ? "todoDone" : ""}`} style={{ borderColor: isOverdue ? "#fecdd3" : "#e4e4e7" }}>
                      <button className={`check ${t.done ? "checkDone" : ""}`} onClick={() => toggleDone(t.id)} aria-label="toggle done">
                        {t.done ? "✓" : ""}
                      </button>

                      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => openEdit(t.id)}>
                        <div className="row wrap">
                          <div className={t.done ? "todoTitle todoTitleDone" : "todoTitle"}>{t.text}</div>

                          <Badge tone={diffTone}>
                            {t.difficulty} · {DIFFICULTY_XP[t.difficulty] || 10} XP
                          </Badge>

                          <Badge tone={prioTone}>{PRIORITY_LABEL[t.priority] || "Normal"}</Badge>

                          {dueLabel ? <Badge tone={isOverdue ? "red" : "neutral"}>Due {dueLabel}</Badge> : null}

                          {Array.isArray(t.tags) && t.tags.length ? (
                            <span className="row wrap" style={{ gap: 6 }}>
                              {t.tags.slice(0, 4).map((tag) => (
                                <Badge key={tag}>#{tag}</Badge>
                              ))}
                              {t.tags.length > 4 ? <Badge>+{t.tags.length - 4}</Badge> : null}
                            </span>
                          ) : null}
                        </div>

                        {t.notes ? <div className="todoNotes">{t.notes}</div> : null}
                      </div>

                      <div className="row">
                        <button className="btn" onClick={() => openEdit(t.id)}>
                          Edit
                        </button>
                        <button className="btn" onClick={() => deleteTodo(t.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="space wrap" style={{ marginTop: 14 }}>
              <div className="small">
                Active: <b>{activeCount}</b>
                {overdueActive ? (
                  <>
                    {" "}
                    · Overdue: <b style={{ color: "#e11d48" }}>{overdueActive}</b>
                  </>
                ) : null}
              </div>
              <button className="btn" onClick={resetAll}>
                Reset demo
              </button>
            </div>
          </section>
        </div>

        <aside style={{ display: "grid", gap: 16 }}>
          {showGame ? (
            <section className="card">
              <div className="space">
                <div>
                  <div className="small">Account</div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>
                    {state.profile.name} <span className="small">· {state.profile.title}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="small">Level</div>
                  <div style={{ fontSize: 26, fontWeight: 950, color: "var(--accent)" }}>{levelInfo.level}</div>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <ProgressBar value={levelInfo.xpIntoLevel} max={levelInfo.xpForNext} label="XP to next level" />
              </div>

              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="card" style={{ background: "#fafafa" }}>
                  <div className="small">Total XP</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{state.stats.totalXP}</div>
                </div>
                <div className="card" style={{ background: "#fafafa" }}>
                  <div className="small">Streak</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{state.stats.streakDays} 🔥</div>
                </div>
                <div className="card" style={{ background: "#fafafa" }}>
                  <div className="small">Done today</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{doneTodayCount}</div>
                </div>
                <div className="card" style={{ background: "#fafafa" }}>
                  <div className="small">Completed</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{state.stats.totalCompleted}</div>
                </div>
              </div>

              <div className="card" style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 900 }}>Daily bonus rules</div>
                <div className="small" style={{ marginTop: 6 }}>
                  First done today: <b>+5 XP</b>. Streak 3+: <b>+5 XP</b>. Streak 7+: <b>+10 XP</b>.
                </div>
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="space">
              <div style={{ fontWeight: 900 }}>QoL Features</div>
              <Badge tone="violet">built-in</Badge>
            </div>
            <div className="small" style={{ marginTop: 10, lineHeight: 1.6 }}>
              Autosave (localStorage), Search + Filter, Smart Sort, Undo (Ctrl/⌘+Z), Fokus (Ctrl/⌘+K).
            </div>
          </section>

          <section className="card">
            <div style={{ fontWeight: 900 }}>Mini-Roadmap</div>
            <div className="small" style={{ marginTop: 10, lineHeight: 1.6 }}>
              Teams/Accounts, Cloud Sync, Kalender Export, wiederholende Aufgaben, Focus-Timer (Pomodoro), Widgets.
            </div>
          </section>
        </aside>
      </div>

      {state.ui.toast ? (
        <div className="toastWrap">
          <div className="toast">{state.ui.toast}</div>
        </div>
      ) : null}

      <Modal
        open={editOpen}
        title="Edit Quest"
        onClose={() => {
          setEditOpen(false);
          setEditId(null);
        }}
      >
        {editTodo ? (
          <EditForm
            todo={editTodo}
            onSave={(patch) => updateTodo(editTodo.id, patch)}
            onClose={() => {
              setEditOpen(false);
              setEditId(null);
            }}
          />
        ) : (
          <div className="small">Not found.</div>
        )}
      </Modal>

      <Modal open={settingsOpen} title="Settings" onClose={() => setSettingsOpen(false)}>
        <SettingsPanel state={state} setState={setState} />
      </Modal>

      <Modal open={achOpen} title="Achievements" onClose={() => setAchOpen(false)}>
        <AchievementsPanel state={state} />
      </Modal>

      <div className="small" style={{ marginTop: 26, textAlign: "center" }}>
        Made for chill productivity. ✨
      </div>
    </div>
  );
}

function EditForm({ todo, onSave, onClose }) {
  const [text, setText] = useState(todo.text || "");
  const [notes, setNotes] = useState(todo.notes || "");
  const [difficulty, setDifficulty] = useState(todo.difficulty || "easy");
  const [priority, setPriority] = useState(todo.priority || "normal");
  const [due, setDue] = useState(fmtDateInput(todo.dueAt));
  const [tags, setTags] = useState(Array.isArray(todo.tags) ? todo.tags.join(", ") : "");

  useEffect(() => {
    setText(todo.text || "");
    setNotes(todo.notes || "");
    setDifficulty(todo.difficulty || "easy");
    setPriority(todo.priority || "normal");
    setDue(fmtDateInput(todo.dueAt));
    setTags(Array.isArray(todo.tags) ? todo.tags.join(", ") : "");
  }, [todo]);

  const xp = DIFFICULTY_XP[difficulty] || 10;

  function save() {
    const cleanTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => t.replace(/^#/, ""))
      .slice(0, 12);

    onSave({
      text: text.trim() || todo.text,
      notes,
      difficulty,
      priority,
      dueAt: parseDateInput(due),
      tags: cleanTags
    });
    onClose();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <div className="small" style={{ fontWeight: 800 }}>
          Title
        </div>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
      </div>

      <div>
        <div className="small" style={{ fontWeight: 800 }}>
          Notes
        </div>
        <textarea className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional: Kontext, Schritte, Links, ..." />
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div>
          <div className="small" style={{ fontWeight: 800 }}>
            Difficulty
          </div>
          <select className="btn" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={{ width: "100%" }}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <div className="small" style={{ marginTop: 6 }}>
            Reward: <b>{xp} XP</b>
          </div>
        </div>

        <div>
          <div className="small" style={{ fontWeight: 800 }}>
            Priority
          </div>
          <select className="btn" value={priority} onChange={(e) => setPriority(e.target.value)} style={{ width: "100%" }}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </div>

        <div>
          <div className="small" style={{ fontWeight: 800 }}>
            Due date
          </div>
          <input className="btn" type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ width: "100%" }} />
          <div className="small" style={{ marginTop: 6 }}>
            Leer lassen = keine Fälligkeit
          </div>
        </div>
      </div>

      <div>
        <div className="small" style={{ fontWeight: 800 }}>
          Tags (comma separated)
        </div>
        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="z.B. kita, eltern, papierkram" />
      </div>

      <div className="space wrap">
        <div className="small">Pro-Tipp: Große Tasks → in 3–5 Mini-Quests splitten.</div>
        <div className="row">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btnPrimary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ state, setState }) {
  const [name, setName] = useState(state.profile.name);
  const [color, setColor] = useState(state.profile.color);
  const [sound, setSound] = useState(state.settings.sound);
  const [reduceMotion, setReduceMotion] = useState(state.settings.reduceMotion);

  useEffect(() => {
    setName(state.profile.name);
    setColor(state.profile.color);
    setSound(state.settings.sound);
    setReduceMotion(state.settings.reduceMotion);
  }, [state.profile.name, state.profile.color, state.settings.sound, state.settings.reduceMotion]);

  function save() {
    setState((s) => ({
      ...s,
      profile: { ...s.profile, name: name.trim() || "Player", color },
      settings: { ...s.settings, sound, reduceMotion },
      ui: { ...s.ui, toast: "Settings saved." }
    }));
  }

  function factoryReset() {
    setState(makeDefaultState());
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div>
          <div className="small" style={{ fontWeight: 800 }}>
            Player name
          </div>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <div className="small" style={{ fontWeight: 800 }}>
            Accent color
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 56, height: 40, borderRadius: 12, border: "1px solid #e4e4e7" }} />
            <input className="input" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </div>
      </div>

      <label className="card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
        <div>
          <div style={{ fontWeight: 800 }}>Sound on XP</div>
          <div className="small">kleines „ding“ bei Completion</div>
        </div>
      </label>

      <label className="card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input type="checkbox" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} />
        <div>
          <div style={{ fontWeight: 800 }}>Reduce motion</div>
          <div className="small">für weniger Animation/Stress</div>
        </div>
      </label>

      <div className="space wrap">
        <div className="small">Speichern ist lokal im Browser. Für echte Accounts braucht man Backend.</div>
        <div className="row">
          <button className="btn" onClick={factoryReset}>
            Factory reset
          </button>
          <button className="btnPrimary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function AchievementsPanel({ state }) {
  const a = state.achievements || {};
  const lvl = levelFromXP(state.stats.totalXP).level;

  const items = [
    { key: "first_done", title: "First Blood", desc: "Mach deine erste Aufgabe fertig.", unlocked: !!a.first_done },
    { key: "streak_3", title: "On Fire", desc: "3 Tage Streak halten.", unlocked: !!a.streak_3 },
    { key: "streak_7", title: "Unstoppable", desc: "7 Tage Streak halten.", unlocked: !!a.streak_7 },
    { key: "completed_10", title: "Task Slayer", desc: "10 Aufgaben insgesamt fertig.", unlocked: !!a.completed_10 },
    { key: "completed_50", title: "Productivity Boss", desc: "50 Aufgaben insgesamt fertig.", unlocked: !!a.completed_50 },
    { key: "level_5", title: "Level 5", desc: "Erreich Level 5.", unlocked: !!a.level_5 || lvl >= 5 },
    { key: "level_10", title: "Level 10", desc: "Erreich Level 10.", unlocked: !!a.level_10 || lvl >= 10 }
  ];

  const unlockedCount = items.filter((x) => x.unlocked).length;

  return (
    <div>
      <div className="space small" style={{ marginBottom: 12 }}>
        <div>
          Unlocked: <b>{unlockedCount}</b>/{items.length}
        </div>
        <div>
          Level: <b>{lvl}</b>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {items.map((it) => (
          <AchievementCard key={it.key} title={it.title} desc={it.desc} unlocked={it.unlocked} />
        ))}
      </div>
    </div>
  );
}
