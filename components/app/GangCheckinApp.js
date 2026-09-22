"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import { Button, Card } from "../shared/ui";
import {
  STORAGE,
  clean,
  ensureDefaultUser,
  keyOf,
  similarity,
  today,
  uid,
} from "../../lib/gang";
import {
  loadSharedStore,
  readLocalStore,
  saveSharedStore,
  subscribeToSharedStore,
  writeLocalStore,
} from "../../lib/shared-store";

function Login({ onAuthed }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = (event) => {
    event.preventDefault();
    const data = ensureDefaultUser(readLocalStore());
    const found = data.users.find((user) => user.username === username.trim());
    if (!found || found.password !== password)
      return setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    data.currentUser = found.username;
    writeLocalStore(data);
    onAuthed(found.username);
  };
  return (
    <main className="login shell">
      <div className="stack">
        <div style={{ textAlign: "center" }}>
          <p className="eyebrow">gang check-in</p>
          <h1 className="brand">เช็คชื่อแก๊ง</h1>
          <p className="muted">เข้าสู่ระบบเพื่อจัดการแก๊งของคุณ</p>
        </div>
        <form className="card stack" onSubmit={submit}>
          <label className="field">
            <span className="label">ชื่อผู้ใช้</span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ชื่อผู้ใช้"
              autoFocus
            />
          </label>
          <label className="field">
            <span className="label">รหัสผ่าน</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="รหัสผ่าน"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <Button type="submit">เข้าสู่ระบบ</Button>
        </form>
      </div>
    </main>
  );
}

function Cropper({ src, rect, onChange }) {
  const ref = useRef(null);
  const [start, setStart] = useState(null);
  const [current, setCurrent] = useState(null);
  const point = (event) => {
    const box = ref.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    };
  };
  const finish = () => {
    if (start && current) {
      const next = {
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        w: Math.abs(current.x - start.x),
        h: Math.abs(current.y - start.y),
      };
      if (next.w > 0.03 && next.h > 0.03) onChange(next);
    }
    setStart(null);
    setCurrent(null);
  };
  const active =
    start && current
      ? {
          x: Math.min(start.x, current.x),
          y: Math.min(start.y, current.y),
          w: Math.abs(current.x - start.x),
          h: Math.abs(current.y - start.y),
        }
      : rect;
  return (
    <div className="stack">
      <div
        ref={ref}
        className="preview"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = point(e);
          setStart(p);
          setCurrent(p);
        }}
        onPointerMove={(e) => start && setCurrent(point(e))}
        onPointerUp={finish}
        onPointerLeave={finish}
      >
        <img src={src} alt="ภาพที่อัปโหลด" draggable="false" />
        {active ? (
          <div
            className="crop"
            style={{
              left: `${active.x * 100}%`,
              top: `${active.y * 100}%`,
              width: `${active.w * 100}%`,
              height: `${active.h * 100}%`,
            }}
          />
        ) : (
          <div
            className="dropzone"
            style={{ position: "absolute", inset: 0, background: "#0008" }}
          >
            ลากล้อมกรอบเฉพาะส่วนที่มีรายชื่อ
          </div>
        )}
      </div>
      <div className="row">
        <span className="muted">
          {rect
            ? "ลากวาดกรอบใหม่เพื่อเปลี่ยน"
            : "แนะนำให้ครอบเฉพาะกล่องรายชื่อ"}
        </span>
        {rect && (
          <button className="link-btn" onClick={() => onChange(null)}>
            ล้างกรอบ
          </button>
        )}
      </div>
    </div>
  );
}

async function cropImage(src, rect) {
  if (!rect) return src;
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  const cropWidth = Math.max(1, image.naturalWidth * rect.w);
  const cropHeight = Math.max(1, image.naturalHeight * rect.h);
  const scale = Math.min(2, 2400 / Math.max(cropWidth, cropHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cropWidth * scale));
  canvas.height = Math.max(1, Math.round(cropHeight * scale));
  canvas
    .getContext("2d")
    .drawImage(
      image,
      image.naturalWidth * rect.x,
      image.naturalHeight * rect.y,
      image.naturalWidth * rect.w,
      image.naturalHeight * rect.h,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  return canvas.toDataURL("image/png");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const STORAGE_CATALOG = [
  "เงินสด", "Aed", "Armor", "BLACK COIN", "Cement", "Copper",
  "Diamond", "EXP", "Gold", "Happy Box", "Painkiller", "Painkiller Pack",
  "Plier", "Steel", "Stone", "Vibranium Scrap", "Weapon Box", "Wood log",
];

function prepareOcrCanvas(image, x, y, width, height, invert = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 180;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const gray = (pixels.data[index] * 0.299) + (pixels.data[index + 1] * 0.587) + (pixels.data[index + 2] * 0.114);
    const value = invert ? 255 - gray : gray;
    const threshold = value > 110 ? 255 : 0;
    pixels.data[index] = threshold;
    pixels.data[index + 1] = threshold;
    pixels.data[index + 2] = threshold;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

async function splitItemGrid(src, cols, rows) {
  const image = await loadImage(src);
  const columns = Math.max(1, Number(cols) || 1);
  const rowCount = Math.max(1, Number(rows) || 1);
  const cellWidth = image.naturalWidth / columns;
  const cellHeight = image.naturalHeight / rowCount;
  const isSingle = columns === 1 && rowCount === 1;
  const isStorageGrid = columns === 6 && rowCount === 3;
  const found = [];
  const worker = isSingle ? null : await createWorker("eng");
  if (worker) {
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789",
      tessedit_pageseg_mode: "7",
    });
  }
  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const sourceX = cellWidth * col;
      const sourceY = cellHeight * row;
      const sourceW = Math.max(1, cellWidth);
      const sourceH = Math.max(1, cellHeight);
      const canvas = document.createElement("canvas");
      canvas.width = 80;
      canvas.height = 80;
      const context = canvas.getContext("2d");
      const imageX = isSingle ? 0 : sourceW * 0.08;
      const imageY = isSingle ? 0 : sourceH * 0.16;
      const imageW = isSingle ? sourceW : sourceW * 0.84;
      const imageH = isSingle ? sourceH : sourceH * 0.54;
      context.drawImage(image, sourceX + imageX, sourceY + imageY, imageW, imageH, 0, 0, 80, 80);
      const slot = row * columns + col;
      name = isStorageGrid ? STORAGE_CATALOG[slot] : `ไอเทม ${slot + 1}`;
      let qty = "1";
      if (worker && !isSingle) {
        const ocrCanvas = prepareOcrCanvas(
          image,
          sourceX + sourceW * 0.42,
          sourceY,
          sourceW * 0.58,
          sourceH * 0.25,
        );
        const result = await worker.recognize(ocrCanvas.toDataURL("image/png"));
        const digits = result.data.text.replace(/[^0-9]/g, "").match(/\d{1,6}/);
        if (digits) qty = digits[0];
      }
      found.push({
        id: uid(),
        image: canvas.toDataURL("image/jpeg", 0.72),
        name,
        qty,
        selected: true,
      });
    }
  }
  await worker?.terminate();
  return found;
}

function Checkin({ gang, update }) {
  const [image, setImage] = useState(null);
  const [rect, setRect] = useState(null);
  const [members, setMembers] = useState(gang.members);
  const [present, setPresent] = useState(new Set());
  const [unmatched, setUnmatched] = useState([]);
  const [date, setDate] = useState(today());
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const input = useRef(null);
  useEffect(() => setMembers(gang.members), [gang.members]);
  const readFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result);
      setRect(null);
      setMessage("");
    };
    reader.readAsDataURL(file);
  };
  useEffect(() => {
    const paste = (event) => {
      const file = [...(event.clipboardData?.items || [])]
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();
      if (file) {
        event.preventDefault();
        readFile(file);
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, []);
  const recognize = async () => {
    if (!image) return;
    setBusy(true);
    setMessage("กำลังโหลดตัวอ่าน OCR...");
    try {
      const source = await cropImage(image, rect);
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (info) => {
          if (info.status === "recognizing text")
            setMessage(`กำลังอ่านรูป... ${Math.round(info.progress * 100)}%`);
        },
      });
      const result = await worker.recognize(source);
      await worker.terminate();
      const lines = result.data.text
        .split(/\r?\n/)
        .map(clean)
        .filter((line) => keyOf(line).length >= 2);
      const hits = new Set();
      const misses = [];
      lines.forEach((line) => {
        let best = 0;
        let match = null;
        members.forEach((member) =>
          [member.name, member.nickname].filter(Boolean).forEach((name) => {
            const score = similarity(keyOf(line), keyOf(name));
            if (score > best) {
              best = score;
              match = member;
            }
          }),
        );
        if (best >= 0.55 && match) hits.add(match.id);
        else if (!misses.includes(line)) misses.push(line);
      });
      setPresent(hits);
      setUnmatched(misses);
      setMessage("ตรวจผลแล้ว แก้เครื่องหมายได้ก่อนบันทึก");
    } catch (error) {
      setMessage(`อ่านรายชื่อไม่สำเร็จ: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    const data = readLocalStore();
    data.checks = data.checks || [];
    data.checks.unshift({
      id: uid(),
      gangId: gang.id,
      date,
      label,
      presentIds: [...present],
    });
    try {
      await saveSharedStore(data);
      setMessage(
        `บันทึกแล้ว ✓ มา ${present.size} คน · ขาด ${members.length - present.size} คน`,
      );
      setImage(null);
      setRect(null);
      setUnmatched([]);
      update();
    } catch (error) {
      setMessage(`บันทึกไม่สำเร็จ: ${error.message}`);
    }
  };
  const toggle = (id) =>
    setPresent((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  return (
    <div className="stack">
      <Card>
        <div className="form-grid">
          <label className="field">
            <span className="label">วันที่</span>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">รอบ/หมายเหตุ (ไม่บังคับ)</span>
            <input
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="เช่น รอบเย็น"
            />
          </label>
        </div>
      </Card>
      <Card className="stack">
        <div className="row">
          <span className="label">ภาพแคปรายชื่อ (วาง Ctrl+V หรืออัปโหลด)</span>
          <span className="muted">สมาชิก {members.length} คน</span>
        </div>
        {image ? (
          <>
            <Cropper src={image} rect={rect} onChange={setRect} />
            <div className="row">
              <button
                className="link-btn"
                onClick={() => input.current?.click()}
              >
                เปลี่ยนรูป
              </button>
              {!rect && (
                <button
                  className="link-btn"
                  onClick={() => setRect({ x: 0, y: 0, w: 1, h: 1 })}
                >
                  ข้ามขั้นตอนนี้
                </button>
              )}
            </div>
          </>
        ) : (
          <div
            className="dropzone"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              readFile(e.dataTransfer.files[0]);
            }}
          >
            <div>
              <p>คลิกเพื่อเลือกไฟล์ ลากวาง หรือกด Ctrl+V เพื่อวางภาพแคป</p>
              <p className="muted">PNG, JPEG หรือ WebP</p>
            </div>
          </div>
        )}
        <input
          ref={input}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => readFile(e.target.files[0])}
        />
        <Button disabled={!image || busy || !rect} onClick={recognize}>
          {busy ? message : "อ่านรายชื่อจากรูป"}
        </Button>
      </Card>
      {message && !busy && (
        <p
          className={
            message.startsWith("อ่านรายชื่อไม่สำเร็จ")
              ? "error"
              : message.startsWith("บันทึกแล้ว")
                ? "success"
                : "muted"
          }
        >
          {message}
        </p>
      )}
      {unmatched.length > 0 && (
        <p className="warning">
          อ่านเจอชื่อที่จับคู่ไม่ได้: {unmatched.join(", ")}
        </p>
      )}
      {(present.size || unmatched.length) > 0 && (
        <Card className="stack">
          <div className="row">
            <strong>ตรวจผลก่อนบันทึก</strong>
            <span className="muted">
              มา {present.size} · ขาด {members.length - present.size} /{" "}
              {members.length}
            </span>
          </div>
          <p className="muted">
            ติ๊ก = มา (แก้ได้ทุกช่อง) ที่ไม่ติ๊กจะถูกบันทึกว่าขาด
          </p>
          <ul className="list">
            {members.map((member) => (
              <li key={member.id}>
                <input
                  type="checkbox"
                  checked={present.has(member.id)}
                  onChange={() => toggle(member.id)}
                />
                <span className="grow">
                  {member.name}{" "}
                  {member.nickname && (
                    <span className="muted">({member.nickname})</span>
                  )}
                </span>
                <span
                  className={`status ${present.has(member.id) ? "present" : "absent"}`}
                >
                  {present.has(member.id) ? "มา" : "ขาด"}
                </span>
              </li>
            ))}
          </ul>
          <Button onClick={save}>
            บันทึกการเช็คชื่อ ({date}
            {label ? ` · ${label}` : ""})
          </Button>
        </Card>
      )}
    </div>
  );
}

function Members({ gang, update }) {
  const [text, setText] = useState("");
  const add = () => {
    const entries = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(.+?)(?:\s*\(([^)]+)\)|\s*,\s*(.+))?$/);
        return {
          id: uid(),
          name: match[1].trim(),
          nickname: (match[2] || match[3] || "").trim(),
        };
      });
    if (!entries.length) return;
    update({ members: [...gang.members, ...entries] });
    setText("");
  };
  return (
    <div className="stack">
      <Card className="stack">
        <h2 className="label">เพิ่มสมาชิกเข้าแก๊ง {gang.name}</h2>
        <p className="muted">
          บรรทัดละ 1 คน — ใส่ชื่อเล่นในวงเล็บหรือหลังจุลภาคก็ได้
        </p>
        <textarea
          className="textarea"
          rows="6"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"White Oconnor (Whitey)\nNico Williams\nThunder Kari"}
        />
        <Button onClick={add} disabled={!text.trim()}>
          เพิ่มสมาชิก
        </Button>
      </Card>
      <Card>
        <div className="row">
          <h2 className="label">สมาชิกทั้งหมด</h2>
          <span className="muted">{gang.members.length} คน</span>
        </div>
        {gang.members.length ? (
          <ul className="list">
            {gang.members.map((member, index) => (
              <li key={member.id}>
                <span className="muted">{index + 1}</span>
                <span className="grow">
                  {member.name}{" "}
                  {member.nickname && (
                    <span className="muted">({member.nickname})</span>
                  )}
                </span>
                <button
                  className="link-btn"
                  onClick={() =>
                    update({
                      members: gang.members.filter(
                        (item) => item.id !== member.id,
                      ),
                    })
                  }
                >
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">ยังไม่มีสมาชิก</p>
        )}
      </Card>
    </div>
  );
}

function History({ gang, refresh }) {
  const data = readLocalStore();
  const checks = (data.checks || []).filter(
    (check) => check.gangId === gang.id,
  );
  const [filter, setFilter] = useState("");
  const filtered = checks.filter((check) => !filter || check.date === filter);
  const stats = gang.members
    .map((member) => ({
      ...member,
      absentCount: filtered.filter(
        (check) => !check.presentIds.includes(member.id),
      ).length,
    }))
    .filter((member) => member.absentCount)
    .sort((a, b) => b.absentCount - a.absentCount);
  return (
    <div className="stack">
      <Card>
        <div className="row">
          <label className="label">กรองวันที่</label>
          <input
            className="input"
            style={{ maxWidth: 180 }}
            type="date"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && (
            <button className="link-btn" onClick={() => setFilter("")}>
              ล้าง
            </button>
          )}
        </div>
      </Card>
      {stats.length > 0 && (
        <Card>
          <h2 className="label">ขาดบ่อยที่สุด</h2>
          <ul className="list">
            {stats.map((member) => (
              <li key={member.id}>
                <span className="grow">{member.name}</span>
                <span className="status absent">
                  ขาด {member.absentCount} ครั้ง
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {filtered.length ? (
        filtered.map((check) => {
          const present = gang.members.filter((member) =>
            check.presentIds.includes(member.id),
          );
          const absent = gang.members.filter(
            (member) => !check.presentIds.includes(member.id),
          );
          return (
            <Card key={check.id}>
              <div className="row">
                <strong>
                  {check.date}
                  {check.label && (
                    <span className="muted"> · {check.label}</span>
                  )}
                </strong>
                <span className="muted">
                  มา {present.length} · ขาด {absent.length}
                </span>
              </div>
              {present.length > 0 && (
                <div className="chips" style={{ marginTop: 12 }}>
                  {present.map((member) => (
                    <span className="chip present-chip" key={member.id}>
                      {member.name}
                    </span>
                  ))}
                </div>
              )}
              {absent.length > 0 && (
                <div className="chips" style={{ marginTop: 8 }}>
                  {absent.map((member) => (
                    <span className="chip" key={member.id}>
                      {member.name}
                    </span>
                  ))}
                </div>
              )}
              {absent.length === 0 && (
                <p
                  className="success"
                  style={{ marginBottom: 0, marginTop: 12 }}
                >
                  มาครบทุกคน ✓
                </p>
              )}
            </Card>
          );
        })
      ) : (
        <Card>
          <p className="empty">ยังไม่มีประวัติการเช็คชื่อ</p>
        </Card>
      )}
    </div>
  );
}

function Payments({ gang, update }) {
  const data = readLocalStore();
  const [week, setWeek] = useState(today());
  const [transactionSource, setTransactionSource] = useState("member");
  const [memberId, setMemberId] = useState(gang.members[0]?.id || "");
  const [transactionType, setTransactionType] = useState("deposit");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionNote, setTransactionNote] = useState("");
  const isAdmin = data.currentUser === "Admin";
  const payments = (data.payments || []).filter((payment) => payment.gangId === gang.id);
  const memberTarget = 200000;
  const amountFor = (id) => payments.filter((payment) => payment.memberId === id && payment.week === week).reduce((sum, payment) => {
    const amount = Number(payment.amount || 0);
    return sum + (payment.type === "withdrawal" ? -amount : amount);
  }, 0);
  const gangTotal = payments.reduce((sum, payment) => {
    const amount = Number(payment.amount || 0);
    return sum + (payment.type === "withdrawal" ? -amount : amount);
  }, 0);
  const complete = gang.members.length > 0 && gang.members.every((member) => amountFor(member.id) >= memberTarget);
  const paymentsByDate = [...payments]
    .sort((a, b) => {
      const dateCmp = String(b.week || "").localeCompare(String(a.week || ""));
      if (dateCmp) return dateCmp;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    })
    .reduce((groups, payment) => {
      const date = payment.week || "ไม่ระบุวันที่";
      const last = groups[groups.length - 1];
      if (last?.date === date) last.items.push(payment);
      else groups.push({ date, items: [payment] });
      return groups;
    }, []);
  const addTransaction = async () => {
    const value = Number(transactionAmount);
    if ((transactionSource === "member" && !memberId) || !Number.isFinite(value) || value <= 0) return;
    const nextPayments = [...(data.payments || []), {
      id: uid(), gangId: gang.id, ...(transactionSource === "member" ? { memberId } : {}), week, amount: value, type: transactionType,
      note: transactionNote.trim(), user: data.currentUser || "Admin", createdAt: new Date().toISOString(),
    }];
    await saveSharedStore({ ...data, payments: nextPayments });
    setTransactionAmount("");
    setTransactionNote("");
    update();
  };
  return (
    <div className="stack">
      <Card className="stack">
        <div className="row">
          <div><p className="label">ยอดส่งเงินรายสมาชิก</p><p className="muted">สมาชิกแต่ละคนต้องส่งให้ครบ 200,000 บาท</p></div>
          <span className={`payment-status ${complete ? "payment-complete" : ""}`}>{complete ? "ครบ 200k แล้ว" : "ยังไม่ครบ"}</span>
        </div>
        <div className={`payment-summary ${complete ? "payment-summary-complete" : ""}`}><div className="row"><span className="label">เงินทั้งหมดภายในแก็งค์</span><strong>{gangTotal.toLocaleString()} บาท</strong></div><p className="muted">รวมทุกรายการฝากและถอนทุกสัปดาห์ ไม่รีเซ็ตเมื่อเปลี่ยนอาทิตย์</p></div>
        <label className="field"><span className="label">สัปดาห์/วันที่ส่งเงิน</span><input className="input" type="date" value={week} onChange={(e) => setWeek(e.target.value)} /></label>
        <div className="form-grid"><label className="field"><span className="label">ฝากเงินเข้า</span><select className="input" value={transactionSource} onChange={(e) => setTransactionSource(e.target.value)}><option value="member">สมาชิก</option><option value="fund">กองเงินรวมของแก๊ง</option></select></label><label className="field"><span className="label">สมาชิก</span><select className="input" value={memberId} disabled={transactionSource !== "member"} onChange={(e) => setMemberId(e.target.value)}><option value="">เลือกสมาชิก</option>{gang.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div>
        <div className="form-grid"><label className="field"><span className="label">ประเภทรายการ</span><select className="input" value={transactionType} onChange={(e) => setTransactionType(e.target.value)}><option value="deposit">ฝาก/ส่งเงิน (+)</option><option value="withdrawal">ถอน/เบิกเงิน (-)</option></select></label><label className="field"><span className="label">จำนวนเงิน</span><input className="input" type="number" min="0" value={transactionAmount} onChange={(e) => setTransactionAmount(e.target.value)} placeholder="จำนวนเงิน" /></label></div>
        <label className="field"><span className="label">หมายเหตุ</span><input className="input" value={transactionNote} onChange={(e) => setTransactionNote(e.target.value)} placeholder="เช่น ฝากเงินวันเสาร์ หรือ เบิกค่าใช้จ่าย" /></label>
        {isAdmin && <Button onClick={addTransaction} disabled={(transactionSource === "member" && !memberId) || !transactionAmount}>บันทึกรายการ</Button>}
        {!isAdmin && <p className="warning">ดูยอดเงินได้ แต่เฉพาะ Admin เท่านั้นที่แก้ไขยอดได้</p>}
      </Card>
      <Card>
        <ul className="list">{gang.members.map((member) => { const total = amountFor(member.id); const completeMember = total >= memberTarget; return <li key={member.id} className={completeMember ? "payment-row payment-row-complete" : "payment-row"}><span className="grow"><strong>{member.name}</strong><span className="muted payment-subtitle">เป้าหมาย 200,000 บาท</span></span><span className={`payment-status ${completeMember ? "payment-complete" : ""}`}>{completeMember ? "ครบแล้ว" : `${total.toLocaleString()} บาท`}</span></li>; })}</ul>
        {!gang.members.length && <p className="empty">ยังไม่มีสมาชิกในแก๊งนี้</p>}
      </Card>
      <Card>
        <div className="row"><h2 className="label">รายการฝาก/ถอนทั้งหมด</h2><span className="muted">{payments.length} รายการ</span></div>
        {payments.length ? paymentsByDate.map((group) => (
          <div className="payment-history-group" key={group.date}>
            <div className="row payment-history-date"><p className="label">{group.date}</p><span className="muted">{group.items.length} รายการ</span></div>
            <ul className="list">{group.items.map((payment) => {
              const withdrawal = payment.type === "withdrawal";
              const member = gang.members.find((item) => item.id === payment.memberId);
              return (
                <li key={payment.id}>
                  <span className="grow">
                    <strong>{withdrawal ? "ถอน/เบิกเงิน" : "ฝาก/ส่งเงิน"}{member ? ` · ${member.name}` : " · เข้ากองเงินรวม"}</strong>
                    <span className="muted payment-subtitle">{payment.note ? `${payment.note} · ` : ""}โดย {payment.user}</span>
                  </span>
                  <span className={`payment-status ${withdrawal ? "payment-withdrawal" : "payment-complete"}`}>{withdrawal ? "-" : "+"}{Number(payment.amount || 0).toLocaleString()} บาท</span>
                </li>
              );
            })}</ul>
          </div>
        )) : <p className="empty">ยังไม่มีรายการฝากหรือถอน</p>}
      </Card>
    </div>
  );
}

function groupLogsByDate(logs) {
  return [...logs]
    .sort((a, b) => {
      const dateCmp = String(b.date || "").localeCompare(String(a.date || ""));
      if (dateCmp) return dateCmp;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    })
    .reduce((groups, log) => {
      const date = log.date || "ไม่ระบุวันที่";
      const last = groups[groups.length - 1];
      if (last?.date === date) last.items.push(log);
      else groups.push({ date, items: [log] });
      return groups;
    }, []);
}

function Safe({ gang, update }) {
  const data = readLocalStore();
  const isAdmin = data.currentUser === "Admin";
  const items = gang.safeItems || [];
  const logs = gang.safeLogs || [];
  const [itemName, setItemName] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [date, setDate] = useState(today());
  const [memberId, setMemberId] = useState(gang.members[0]?.id || "");
  const [withdrawQty, setWithdrawQty] = useState({});
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [scanImage, setScanImage] = useState(null);
  const [scanRect, setScanRect] = useState(null);
  const [scanCols, setScanCols] = useState("6");
  const [scanRows, setScanRows] = useState("3");
  const [scanBusy, setScanBusy] = useState(false);
  const [scannedItems, setScannedItems] = useState([]);
  const scanInput = useRef(null);
  useEffect(() => {
    if (!gang.members.some((member) => member.id === memberId)) {
      setMemberId(gang.members[0]?.id || "");
    }
  }, [gang.members, memberId]);
  const logsByDate = groupLogsByDate(logs);
  const withdrawStats = gang.members
    .map((member) => ({
      ...member,
      count: logs.filter((log) => log.type === "out" && log.memberId === member.id).length,
    }))
    .filter((member) => member.count)
    .sort((a, b) => b.count - a.count);
  const inStock = items.filter((item) => Number(item.qty) > 0);
  const emptyStock = items.filter((item) => Number(item.qty) <= 0);
  const saveSafe = async (safeItems, safeLogs, successMessage) => {
    try {
      await update({ safeItems, safeLogs });
      setMessage(successMessage);
    } catch (error) {
      setMessage(`บันทึกไม่สำเร็จ: ${error.message}`);
    }
  };
  const addStock = async () => {
    const name = itemName.trim();
    const qty = Number(stockQty);
    if (!name || !Number.isFinite(qty) || qty <= 0) return;
    const existing = items.find((item) => item.name.trim().toLowerCase() === name.toLowerCase());
    const nextItems = existing
      ? items.map((item) => item.id === existing.id ? { ...item, qty: Number(item.qty) + qty } : item)
      : [...items, { id: uid(), name, qty }];
    const item = existing || nextItems[nextItems.length - 1];
    await saveSafe(nextItems, [{
      id: uid(),
      date,
      type: "in",
      itemId: item.id,
      itemName: item.name,
      quantity: qty,
      note: existing ? "เติมของเข้าตู้" : "เพิ่มไอเทมใหม่",
      user: data.currentUser || "Admin",
      createdAt: new Date().toISOString(),
    }, ...logs], `บันทึกแล้ว ✓ นำ ${item.name} เข้าตู้ ${qty} ชิ้น`);
    setItemName("");
    setStockQty("");
  };
  const withdraw = async () => {
    const picks = items
      .map((item) => ({ item, qty: Number(withdrawQty[item.id] || 0) }))
      .filter(({ qty }) => Number.isFinite(qty) && qty > 0);
    if (!memberId || !picks.length) return;
    const shortage = picks.find(({ item, qty }) => Number(item.qty) < qty);
    if (shortage) {
      setMessage(`ของในตู้ไม่พอ: ${shortage.item.name} มี ${shortage.item.qty} ชิ้น`);
      return;
    }
    const nextItems = items.map((item) => {
      const pick = picks.find((entry) => entry.item.id === item.id);
      return pick ? { ...item, qty: Number(item.qty) - pick.qty } : item;
    });
    const createdAt = new Date().toISOString();
    const nextLogs = [
      ...picks.map(({ item, qty }) => ({
        id: uid(),
        date,
        type: "out",
        itemId: item.id,
        itemName: item.name,
        quantity: qty,
        memberId,
        note: note.trim(),
        user: data.currentUser || "Admin",
        createdAt,
      })),
      ...logs,
    ];
    const summary = picks.map(({ item, qty }) => `${item.name} ${qty}`).join(" · ");
    await saveSafe(nextItems, nextLogs, `บันทึกแล้ว ✓ เบิก ${summary}`);
    setWithdrawQty({});
    setNote("");
  };
  const removeItem = async (id) => {
    await saveSafe(
      items.filter((item) => item.id !== id),
      logs,
      "ลบไอเทมออกจากตู้แล้ว",
    );
  };
  const readScanFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setScanImage(reader.result);
      setScanRect(null);
      setScannedItems([]);
      setMessage("");
    };
    reader.readAsDataURL(file);
  };
  useEffect(() => {
    const paste = (event) => {
      const file = [...(event.clipboardData?.items || [])]
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();
      if (file) {
        event.preventDefault();
        readScanFile(file);
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, []);
  const splitScan = async (single) => {
    if (!scanImage) return;
    setScanBusy(true);
    setMessage("กำลังตัดรูปไอเทม...");
    try {
      const source = await cropImage(scanImage, scanRect);
      const next = await splitItemGrid(source, single ? 1 : scanCols, single ? 1 : scanRows);
      setScannedItems(next);
      setMessage(next.length ? `ตัดได้ ${next.length} รูป ตรวจชื่อและจำนวนก่อนบันทึก` : "ไม่พบช่องที่มีไอเทม ลองครอบกรอบใหม่หรือลดจำนวนช่อง");
    } catch (error) {
      setMessage(`ตัดรูปไม่สำเร็จ: ${error.message}`);
    } finally {
      setScanBusy(false);
    }
  };
  const saveScannedItems = async () => {
    const picks = scannedItems.filter((item) => item.selected && item.name.trim() && Number(item.qty) > 0);
    if (!picks.length) return;
    let nextItems = [...items];
    const createdAt = new Date().toISOString();
    const nextLogs = [];
    picks.forEach((scanned) => {
      const qty = Number(scanned.qty);
      const name = scanned.name.trim();
      const existing = nextItems.find((item) => item.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        nextItems = nextItems.map((item) => item.id === existing.id
          ? { ...item, qty: Number(item.qty) + qty, image: scanned.image || item.image }
          : item);
        nextLogs.push({
          id: uid(), date, type: "in", itemId: existing.id, itemName: existing.name, quantity: qty,
          note: note.trim() || "สแกนจากรูป", user: data.currentUser || "Admin", createdAt,
        });
      } else {
        const created = { id: uid(), name, qty, image: scanned.image };
        nextItems = [...nextItems, created];
        nextLogs.push({
          id: uid(), date, type: "in", itemId: created.id, itemName: created.name, quantity: qty,
          note: note.trim() || "สแกนจากรูป", user: data.currentUser || "Admin", createdAt,
        });
      }
    });
    await saveSafe(nextItems, [...nextLogs, ...logs], `บันทึกแล้ว ✓ นำไอเทมจากสแกน ${picks.length} รายการเข้าตู้`);
    setScanImage(null);
    setScanRect(null);
    setScannedItems([]);
  };
  return (
    <div className="stack">
      <Card>
        <div className="form-grid">
          <label className="field">
            <span className="label">วันที่</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">หมายเหตุ (ไม่บังคับ)</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น เบิกรอบดึก" />
          </label>
        </div>
      </Card>
      <Card className="stack">
        <div className="row">
          <span className="label">สแกนแคปช่องของ (วาง Ctrl+V หรืออัปโหลด)</span>
          <span className="muted">ตัดเป็นรูปไอเทมแล้วบันทึกลงตู้</span>
        </div>
        {scanImage ? (
          <>
            <Cropper src={scanImage} rect={scanRect} onChange={setScanRect} />
            <div className="row">
              <button className="link-btn" onClick={() => scanInput.current?.click()}>เปลี่ยนรูป</button>
              {!scanRect && (
                <button className="link-btn" onClick={() => setScanRect({ x: 0, y: 0, w: 1, h: 1 })}>ใช้ทั้งรูป</button>
              )}
              <button className="link-btn" onClick={() => { setScanImage(null); setScanRect(null); setScannedItems([]); }}>ล้างรูป</button>
            </div>
            <div className="form-grid">
              <label className="field">
                <span className="label">จำนวนคอลัมน์</span>
                <input className="input" type="number" min="1" max="50" value={scanCols} onChange={(e) => setScanCols(e.target.value)} />
              </label>
              <label className="field">
                <span className="label">จำนวนแถว</span>
                <input className="input" type="number" min="1" max="50" value={scanRows} onChange={(e) => setScanRows(e.target.value)} />
              </label>
            </div>
          </>
        ) : (
          <div
            className="dropzone"
            onClick={() => scanInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              readScanFile(e.dataTransfer.files[0]);
            }}
          >
            <div>
              <p>คลิกเพื่อเลือกไฟล์ ลากวาง หรือกด Ctrl+V เพื่อวางภาพแคปช่องของ</p>
              <p className="muted">ครอบเฉพาะช่องไอเทม แล้วกดตัดเป็นรูป</p>
            </div>
          </div>
        )}
        <input
          ref={scanInput}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => readScanFile(e.target.files[0])}
        />
        {isAdmin && (
          <div className="row">
            <Button disabled={!scanImage || scanBusy || !scanRect} onClick={() => splitScan(false)}>
              {scanBusy ? message : "ตัดเป็นรูปไอเทม"}
            </Button>
            <button className="subtle-btn" disabled={!scanImage || scanBusy || !scanRect} onClick={() => splitScan(true)}>
              ใช้ทั้งรูปเป็นไอเทมเดียว
            </button>
          </div>
        )}
        {scannedItems.length > 0 && (
          <>
            <div className="row">
              <p className="label">รูปที่ตัดได้</p>
              <span className="muted">คลิกรูปเพื่อไม่บันทึกช่องนั้น</span>
            </div>
            <div className="item-scan-grid">
              {scannedItems.map((item) => (
                <div className={`item-card ${item.selected ? "" : "item-card-skipped"}`} key={item.id}>
                  <button type="button" className="item-thumb-btn" onClick={() => setScannedItems((old) => old.map((entry) => entry.id === item.id ? { ...entry, selected: !entry.selected } : entry))}>
                    <img src={item.image} alt={item.name} />
                  </button>
                  <input className="input" value={item.name} onChange={(e) => setScannedItems((old) => old.map((entry) => entry.id === item.id ? { ...entry, name: e.target.value } : entry))} placeholder="ชื่อไอเทม" />
                  <input className="input" type="number" min="1" value={item.qty} onChange={(e) => setScannedItems((old) => old.map((entry) => entry.id === item.id ? { ...entry, qty: e.target.value } : entry))} />
                </div>
              ))}
            </div>
            {isAdmin && (
              <Button onClick={saveScannedItems} disabled={!scannedItems.some((item) => item.selected && item.name.trim() && Number(item.qty) > 0)}>
                บันทึกไอเทมจากสแกน
              </Button>
            )}
          </>
        )}
      </Card>
      <Card className="stack">
        <div className="row">
          <div>
            <p className="label">ของในตู้เซฟ</p>
            <p className="muted">มีของ {inStock.length} รายการ · หมด {emptyStock.length} รายการ</p>
          </div>
          <span className="muted">{items.length} ไอเทม</span>
        </div>
        {items.length > 0 ? (
          <div className="item-grid">
            {items.map((item) => (
              <div className={`item-card ${Number(item.qty) > 0 ? "" : "item-card-empty"}`} key={item.id}>
                {item.image ? <img src={item.image} alt={item.name} /> : <span className="item-fallback">{item.name.slice(0, 1)}</span>}
                <strong>{item.name}</strong>
                <span className="muted">{Number(item.qty) > 0 ? `${item.qty} ชิ้น` : "หมด"}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">ยังไม่มีไอเทมในตู้เซฟ</p>
        )}
      </Card>
      <Card className="stack">
        <p className="label">นำของเข้าตู้</p>
        <div className="form-grid">
          <label className="field">
            <span className="label">ชื่อไอเทม</span>
            <input className="input" list="safe-item-names" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="เช่น ยา, อาวุธ" />
            <datalist id="safe-item-names">
              {items.map((item) => <option key={item.id} value={item.name} />)}
            </datalist>
          </label>
          <label className="field">
            <span className="label">จำนวน</span>
            <input className="input" type="number" min="1" value={stockQty} onChange={(e) => setStockQty(e.target.value)} placeholder="จำนวนชิ้น" />
          </label>
        </div>
        {isAdmin && <Button onClick={addStock} disabled={!itemName.trim() || !stockQty}>บันทึกของเข้าตู้</Button>}
        {!isAdmin && <p className="warning">ดูของในตู้ได้ แต่เฉพาะ Admin เท่านั้นที่แก้ไขได้</p>}
      </Card>
      <Card className="stack">
        <div className="row">
          <p className="label">เบิกของออกจากตู้</p>
          <span className="muted">เลือกจำนวนที่ต้องการเบิก แล้วบันทึก</span>
        </div>
        <label className="field">
          <span className="label">ผู้เบิก</span>
          <select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">เลือกสมาชิก</option>
            {gang.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
        {items.length ? (
          <ul className="list">
            {items.map((item) => (
              <li key={item.id} className="payment-row">
                {item.image ? <img className="item-list-thumb" src={item.image} alt="" /> : null}
                <span className="grow">
                  <strong>{item.name}</strong>
                  <span className="muted payment-subtitle">คงเหลือ {item.qty} ชิ้น</span>
                </span>
                <input
                  className="input payment-input safe-qty"
                  type="number"
                  min="0"
                  max={item.qty}
                  value={withdrawQty[item.id] || ""}
                  disabled={!isAdmin || item.qty <= 0}
                  onChange={(e) => setWithdrawQty((old) => ({ ...old, [item.id]: e.target.value }))}
                  placeholder="0"
                />
                {isAdmin && (
                  <button className="link-btn" onClick={() => removeItem(item.id)}>ลบ</button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">เพิ่มไอเทมก่อนจึงจะเบิกได้</p>
        )}
        {isAdmin && (
          <Button onClick={withdraw} disabled={!memberId || !items.some((item) => Number(withdrawQty[item.id] || 0) > 0)}>
            บันทึกการเบิก
          </Button>
        )}
      </Card>
      {message && (
        <p className={message.startsWith("บันทึกไม่สำเร็จ") || message.startsWith("ของในตู้ไม่พอ") ? "error" : message.startsWith("บันทึกแล้ว") ? "success" : "muted"}>
          {message}
        </p>
      )}
      {withdrawStats.length > 0 && (
        <Card>
          <h2 className="label">เบิกบ่อยที่สุด</h2>
          <ul className="list">
            {withdrawStats.map((member) => (
              <li key={member.id}>
                <span className="grow">{member.name}</span>
                <span className="status absent">เบิก {member.count} ครั้ง</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {logsByDate.length ? logsByDate.map((group) => {
        const incoming = group.items.filter((log) => log.type === "in");
        const outgoing = group.items.filter((log) => log.type === "out");
        return (
          <Card key={group.date}>
            <div className="row">
              <strong>{group.date}</strong>
              <span className="muted">เข้า {incoming.length} · เบิก {outgoing.length}</span>
            </div>
            {incoming.length > 0 && (
              <div className="chips" style={{ marginTop: 12 }}>
                {incoming.map((log) => (
                  <span className="chip present-chip" key={log.id}>
                    เข้า {log.itemName} × {log.quantity}{log.note ? ` · ${log.note}` : ""}
                  </span>
                ))}
              </div>
            )}
            {outgoing.length > 0 && (
              <div className="chips" style={{ marginTop: 8 }}>
                {outgoing.map((log) => {
                  const member = gang.members.find((item) => item.id === log.memberId);
                  return (
                    <span className="chip" key={log.id}>
                      เบิก {log.itemName} × {log.quantity}{member ? ` · ${member.name}` : ""}{log.note ? ` · ${log.note}` : ""}
                    </span>
                  );
                })}
              </div>
            )}
          </Card>
        );
      }) : (
        <Card>
          <p className="empty">ยังไม่มีประวัติการเบิกหรือนำของเข้าตู้</p>
        </Card>
      )}
    </div>
  );
}

export default function GangCheckinApp() {
  const [user, setUser] = useState(undefined);
  const [gangs, setGangs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("check");
  const [newGang, setNewGang] = useState("");
  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const data = await loadSharedStore();
        if (!active) return;
        const local = readLocalStore();
        if (local.currentUser) {
          setUser(local.currentUser);
          setGangs(data.gangs || []);
        } else setUser(null);
      } catch {
        if (active) setUser(null);
      }
    };
    initialize();
    const unsubscribe = subscribeToSharedStore((data) => {
      if (active) setGangs(data.gangs || []);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const sync = useCallback(async () => {
    const data = await loadSharedStore();
    setGangs(data.gangs || []);
  }, []);
  const gang = gangs.find((item) => item.id === selected) || null;
  const updateGang = async (patch) => {
    const data = readLocalStore();
    data.gangs = (data.gangs || []).map((item) =>
      item.id === gang.id ? { ...item, ...patch } : item,
    );
    await saveSharedStore(data);
    setGangs(data.gangs);
  };
  const create = async () => {
    if (!newGang.trim()) return;
    const data = readLocalStore();
    const item = {
      id: uid(),
      name: newGang.trim(),
      user: data.currentUser || "shared",
      members: [],
    };
    data.gangs = [...(data.gangs || []), item];
    await saveSharedStore(data);
    setNewGang("");
    setGangs(data.gangs);
    setSelected(item.id);
    setTab("members");
  };
  const logout = () => {
    const data = readLocalStore();
    delete data.currentUser;
    writeLocalStore(data);
    setUser(null);
  };
  if (user === undefined)
    return (
      <main
        className="shell"
        style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}
      >
        <div className="spinner" />
      </main>
    );
  if (!user)
    return (
      <Login
        onAuthed={async (name) => {
          const data = await loadSharedStore();
          data.currentUser = name;
          writeLocalStore(data);
          setUser(name);
          setGangs(data.gangs || []);
        }}
      />
    );
  return (
    <main className="shell">
      <header className="topbar">
        <h1 className="brand">เช็คชื่อแก๊ง</h1>
        <div className="userbar">
          <span>@{user}</span>
          <button className="subtle-btn" onClick={logout}>
            ออกจากระบบ
          </button>
        </div>
      </header>
      <Card className="stack">
        <span className="label">แก๊งของฉัน</span>
        {gangs.length ? (
          <div className="gangs">
            {gangs.map((item) => (
              <button
                key={item.id}
                className={`gang-pill ${item.id === selected ? "active" : ""}`}
                onClick={() => setSelected(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="empty">ยังไม่มีแก๊ง — สร้างแก๊งแรกด้านล่างได้เลย</p>
        )}
        <div className="create-row">
          <input
            className="input"
            value={newGang}
            onChange={(e) => setNewGang(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="ตั้งชื่อแก๊งใหม่..."
          />
          <Button onClick={create} disabled={!newGang.trim()}>
            + สร้างแก๊ง
          </Button>
        </div>
      </Card>
      {gang && (
        <div className="stack" style={{ marginTop: 16 }}>
          <nav className="tabs">
            {[
              ["check", "เช็คชื่อ"],
              ["members", "สมาชิก"],
              ["history", "ประวัติ"],
              ["payments", "ส่งเงิน"],
              ["safe", "ตู้เซฟ"],
            ].map(([value, text]) => (
              <button
                className={`tab ${tab === value ? "active" : ""}`}
                key={value}
                onClick={() => setTab(value)}
              >
                {text}
              </button>
            ))}
          </nav>
          {tab === "check" && <Checkin gang={gang} update={sync} />}
          {tab === "members" && <Members gang={gang} update={updateGang} />}
          {tab === "history" && <History gang={gang} refresh={sync} />}
          {tab === "payments" && <Payments gang={gang} update={sync} />}
          {tab === "safe" && <Safe gang={gang} update={updateGang} />}
        </div>
      )}
    </main>
  );
}
