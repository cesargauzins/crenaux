// Export Excel de la vue de gestion : un bloc par créneau, prêt à imprimer.
window.CreneauxExport = (() => {
  "use strict";

  const C = {
    green: "FF14513C",
    greenMid: "FF1F8660",
    greenSoft: "FFDCF3E8",
    greenPale: "FFF0FAF5",
    text: "FF0F1F18",
    text2: "FF3F5249",
    muted: "FF8A9A92",
    line: "FFD5E0DA",
    white: "FFFFFFFF",
  };
  const FONT = "Calibri";
  const COLS = ["A", "B", "C", "D", "E", "F"];
  // Au-delà, les places libres tiennent sur une seule ligne récapitulative.
  const MAX_EMPTY_ROWS = 10;

  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const font = (o = {}) => ({ name: FONT, size: 11, ...o, color: { argb: o.color || C.text } });
  const hair = { style: "thin", color: { argb: C.line } };

  function build(ExcelJS, data, dateLabel) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Créneaux";
    wb.created = new Date();

    const sheetName = data.title.replace(/[\\/*?:[\]]/g, " ").slice(0, 31).trim() || "Créneaux";
    const ws = wb.addWorksheet(sheetName, {
      views: [{ showGridLines: false }],
      pageSetup: {
        paperSize: 9,
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
      },
      headerFooter: {
        oddFooter: `&L&"${FONT}"&8&K8A9A92Créneaux · creneaux.sudoo.fr&R&"${FONT}"&8&K8A9A92Page &P / &N`,
      },
    });

    // A et F : marges ; B : n° ; C : prénom ; D : nom ; E : émargement.
    ws.columns = [{ width: 3 }, { width: 7 }, { width: 28 }, { width: 28 }, { width: 22 }, { width: 3 }];

    let r = 1;
    const row = (height) => {
      const current = ws.getRow(r++);
      if (height) current.height = height;
      return current;
    };
    const merge = (rowNum, from, to) => ws.mergeCells(`${from}${rowNum}:${to}${rowNum}`);

    const people = data.slots.reduce((n, s) => n + s.people.length, 0);
    const total = data.slots.length * data.capacity;

    // ---- En-tête ----
    row(10);

    const band = row(8);
    ["B", "C", "D", "E"].forEach((c) => (band.getCell(c).fill = fill(C.green)));

    row(14);

    const title = row(34);
    title.getCell("B").value = data.title;
    title.getCell("B").font = font({ size: 22, bold: true, color: C.green });
    title.getCell("B").alignment = { vertical: "middle" };
    merge(title.number, "B", "E");

    const sub = row(20);
    sub.getCell("B").value = `${dateLabel}   ·   ${data.slots.length} créneau${data.slots.length > 1 ? "x" : ""}   ·   ${data.capacity} personne${data.capacity > 1 ? "s" : ""} par créneau`;
    sub.getCell("B").font = font({ size: 11, color: C.text2 });
    sub.getCell("B").alignment = { vertical: "middle" };
    merge(sub.number, "B", "E");

    row(10);

    // Chiffres clés
    const stats = row(30);
    const statCells = [
      ["B", "C", `${people} / ${total}`, "places prises"],
      ["D", "D", `${total - people}`, "places libres"],
      ["E", "E", `${total ? Math.round((people / total) * 100) : 0} %`, "de remplissage"],
    ];
    const statLabels = row(18);
    statCells.forEach(([from, to, value, label]) => {
      const v = stats.getCell(from);
      // Espaces de tête : le retrait de cellule n'est pas rendu partout.
      v.value = `  ${value}`;
      v.font = font({ size: 18, bold: true, color: C.green });
      v.alignment = { vertical: "bottom", indent: 1 };
      const l = statLabels.getCell(from);
      l.value = `     ${label}`;
      l.font = font({ size: 9, color: C.muted });
      l.alignment = { vertical: "top", indent: 1 };
      if (from !== to) {
        merge(stats.number, from, to);
        merge(statLabels.number, from, to);
      }
      for (const c of COLS.slice(COLS.indexOf(from), COLS.indexOf(to) + 1)) {
        stats.getCell(c).fill = fill(C.greenPale);
        statLabels.getCell(c).fill = fill(C.greenPale);
      }
    });

    row(22);

    // Libellés de colonnes
    const head = row(20);
    [["B", "N°"], ["C", "Prénom"], ["D", "Nom"], ["E", "Émargement"]].forEach(([c, v]) => {
      const cell = head.getCell(c);
      cell.value = v.toUpperCase();
      cell.font = font({ size: 9, bold: true, color: C.muted });
      cell.alignment = { vertical: "middle", horizontal: c === "B" || c === "E" ? "center" : "left", indent: c === "C" || c === "D" ? 1 : 0 };
      cell.border = { bottom: { style: "medium", color: { argb: C.green } } };
    });

    row(8);

    // ---- Un bloc par créneau ----
    data.slots.forEach((slot) => {
      const full = slot.people.length >= data.capacity;

      const bar = row(28);
      ["B", "C", "D", "E"].forEach((c) => (bar.getCell(c).fill = fill(full ? C.green : C.greenMid)));
      // L'horaire s'aligne sur la colonne des prénoms.
      bar.getCell("C").value = `${slot.starts} – ${slot.ends}`;
      bar.getCell("C").font = font({ size: 13, bold: true, color: C.white });
      bar.getCell("C").alignment = { vertical: "middle", indent: 1 };
      merge(bar.number, "C", "D");
      bar.getCell("E").value = `${full ? "Complet · " : ""}${slot.people.length} / ${data.capacity}  `;
      bar.getCell("E").font = font({ size: 11, bold: true, color: C.white });
      bar.getCell("E").alignment = { vertical: "middle", horizontal: "right", indent: 1 };

      const line = (cells, zebra) => {
        const l = row(24);
        ["B", "C", "D", "E"].forEach((c) => {
          const cell = l.getCell(c);
          cell.fill = fill(zebra ? C.greenPale : C.white);
          cell.border = { bottom: hair };
          cell.alignment = { vertical: "middle", indent: c === "C" || c === "D" ? 1 : 0, horizontal: c === "B" ? "center" : undefined };
        });
        cells(l);
        return l;
      };

      slot.people.forEach((p, i) =>
        line((l) => {
          l.getCell("B").value = i + 1;
          l.getCell("B").font = font({ size: 10, bold: true, color: C.muted });
          l.getCell("C").value = p.first_name;
          l.getCell("C").font = font({ size: 11, bold: true });
          l.getCell("D").value = p.last_name.toUpperCase();
          l.getCell("D").font = font({ size: 11 });
          const sign = l.getCell("E");
          sign.border = { top: hair, left: hair, right: hair, bottom: hair };
          sign.fill = fill(C.white);
        }, i % 2 === 1)
      );

      const free = data.capacity - slot.people.length;
      const emptyRows = free <= MAX_EMPTY_ROWS ? free : 1;
      for (let k = 0; k < emptyRows; k++) {
        const n = slot.people.length + k;
        line((l) => {
          l.getCell("B").value = free <= MAX_EMPTY_ROWS ? n + 1 : "";
          l.getCell("B").font = font({ size: 10, color: C.line });
          l.getCell("C").value = free <= MAX_EMPTY_ROWS ? "Place libre" : `${free} places libres`;
          l.getCell("C").font = font({ size: 10, italic: true, color: C.muted });
          merge(l.number, "C", "D");
        }, n % 2 === 1);
      }

      row(16);
    });

    return wb.xlsx
      .writeBuffer()
      .then((buf) => new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }

  return { build };
})();
