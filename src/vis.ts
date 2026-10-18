import type { FeatureCollection, Geometry, MultiLineString } from "geojson";
import { geoCircle, geoMercator, geoPath } from "d3-geo";
import { scaleBand, scaleLinear, scaleLog } from "d3-scale";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { type Daerah, type Gempa, type Katalog, gempa, kelasDalam } from "./analisis";

/* ---------- umum ---------- */
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const tanggal = (d: Date) => `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
export const mag1 = (m: number) => m.toFixed(1).replace(".", ",");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const cssVar = (nama: string) => getComputedStyle(document.documentElement).getPropertyValue(nama).trim();

export function warnaDalam(km: number): string {
  const k = kelasDalam(km);
  return cssVar(k === "dangkal" ? "--dangkal" : k === "menengah" ? "--menengah" : k === "dalam" ? "--dalam" : "--tidak-tahu");
}
const teksDalam = (km: number) => (km < 0 ? "kedalaman tidak tercatat" : `kedalaman ${km} km`);

export function isiTip(g: Gempa): string {
  return `<b>M${mag1(g.mag)}</b> <span class="waktu">${tanggal(g.waktu)}</span><br>${g.jarak} km dari ${esc(g.daerah.nama)}<br><span class="waktu">${teksDalam(g.dalam)}</span>`;
}

function buatTip(wadah: HTMLElement) {
  const el = document.createElement("div");
  el.className = "tip";
  el.hidden = true;
  wadah.append(el);
  return {
    tampil(x: number, y: number, html: string) {
      el.innerHTML = html;
      el.hidden = false;
      const w = el.offsetWidth;
      const kiri = x + 14 + w > wadah.clientWidth ? x - 14 - w : x + 14;
      el.style.left = `${Math.max(0, kiri)}px`;
      el.style.top = `${Math.max(0, y - el.offsetHeight - 10)}px`;
    },
    sembunyi() {
      el.hidden = true;
    },
  };
}

/* ---------- pita seismogram ---------- */
/** Simpangan garis: diskalakan dari energi, dipangkas supaya M5 tetap terlihat dan M9 tidak keluar bingkai. */
const simpangan = (m: number) => Math.min(1, 0.06 + 0.94 * ((m - 5) / 4.2) ** 1.6);

export function gambarSeismo(wadah: HTMLElement, k: Katalog): void {
  const lebar = Math.max(320, wadah.clientWidth);
  const tinggi = lebar < 600 ? 150 : 210;
  const dpr = window.devicePixelRatio || 1;
  const awal = Date.UTC(1900, 0, 1) / 1000;
  const akhir = Math.max(k.t[k.n - 1], Date.now() / 1000);
  const x = scaleLinear().domain([awal, akhir]).range([6, lebar - 6]);
  const tengah = tinggi / 2;

  wadah.innerHTML = "";
  const c = document.createElement("canvas");
  c.width = lebar * dpr;
  c.height = tinggi * dpr;
  c.style.height = `${tinggi}px`;
  wadah.append(c);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const merah = cssVar("--merah");
  ctx.strokeStyle = cssVar("--tinta");
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, tengah);
  ctx.lineTo(lebar, tengah);
  ctx.stroke();
  ctx.strokeStyle = merah;
  // Kecil dulu, besar terakhir supaya lonjakan besar tidak tertutup.
  const urut = [...Array(k.n).keys()].sort((a, b) => k.mag[a] - k.mag[b]);
  for (const i of urut) {
    const h = simpangan(k.mag[i]) * (tengah - 4);
    ctx.globalAlpha = k.mag[i] >= 7 ? 1 : k.mag[i] >= 6 ? 0.7 : 0.35;
    ctx.lineWidth = k.mag[i] >= 7 ? 1.4 : 1;
    const px = Math.round(x(k.t[i])) + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, tengah - h);
    ctx.lineTo(px, tengah + h * 0.8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Label untuk beberapa gempa terbesar yang letaknya tidak saling tumpuk.
  const label: number[] = [];
  for (const i of [...urut].reverse()) {
    if (label.length >= (lebar < 600 ? 2 : 4)) break;
    // Satu label selebar ~115 px; beri jarak cukup supaya tidak bertumpuk.
    if (label.every((j) => Math.abs(x(k.t[j]) - x(k.t[i])) > (lebar < 600 ? 190 : 150))) label.push(i);
  }
  const lapis = document.createElement("div");
  lapis.className = "sumbu-tahun";
  for (let th = 1900; th <= new Date().getUTCFullYear(); th += lebar < 600 ? 25 : 20) {
    // Tahun pertama rata kiri supaya tidak terpotong tepi bingkai.
    const px = x(Date.UTC(th, 0, 1) / 1000);
    const gaya = th === 1900 ? "left:0;transform:none" : px > lebar - 24 ? "right:0;transform:none" : `left:${px}px`;
    lapis.insertAdjacentHTML("beforeend", `<span style="${gaya}">${th}</span>`);
  }
  wadah.append(lapis);
  for (const i of label) {
    const g = gempa(k, i);
    const el = document.createElement("span");
    el.style.cssText = `position:absolute;top:2px;left:${x(k.t[i]) + 6}px;font:600 12px var(--mono);color:var(--merah);white-space:nowrap;${x(k.t[i]) > lebar - 140 ? "transform:translateX(calc(-100% - 12px))" : ""}`;
    el.textContent = `M${mag1(g.mag)} · ${g.waktu.getUTCFullYear()}`;
    wadah.append(el);
  }

  const tip = buatTip(wadah);
  const urutT = [...Array(k.n).keys()];
  c.addEventListener("pointermove", (e) => {
    const kotak = c.getBoundingClientRect();
    const px = e.clientX - kotak.left;
    const t0 = x.invert(px - 4);
    const t1 = x.invert(px + 4);
    let pilih = -1;
    for (const i of urutT) {
      if (k.t[i] < t0) continue;
      if (k.t[i] > t1) break;
      if (pilih < 0 || k.mag[i] > k.mag[pilih]) pilih = i;
    }
    if (pilih < 0) return tip.sembunyi();
    tip.tampil(x(k.t[pilih]), tengah - simpangan(k.mag[pilih]) * (tengah - 4), isiTip(gempa(k, pilih)));
  });
  c.addEventListener("pointerleave", () => tip.sembunyi());
}

/* ---------- peta ---------- */
type Prop = { id: string };
export type Peta = { darat: FeatureCollection<Geometry, Prop>; batas: MultiLineString };

export async function muatPeta(): Promise<Peta> {
  const r = await fetch(`${import.meta.env.BASE_URL}data/peta.json`);
  const topo = (await r.json()) as Topology<{ daerah: GeometryCollection<Prop> }>;
  return {
    darat: feature(topo, topo.objects.daerah) as FeatureCollection<Geometry, Prop>,
    batas: mesh(topo, topo.objects.daerah, (a, b) => a !== b) as MultiLineString,
  };
}

const jariJari = (m: number, skala = 1) => (1.2 + 2.3 * (m - 5) ** 1.5) * skala;

/** Peta seluruh Indonesia: daratan SVG + titik gempa di kanvas (13 ribu titik). */
export function gambarPetaBesar(wadah: HTMLElement, peta: Peta, k: Katalog, magMin: number): void {
  const lebar = Math.max(320, wadah.clientWidth);
  const tinggi = Math.round(lebar * 0.42);
  // Dipaskan ke daratan sekaligus semua episentrum, supaya gempa laut lepas
  // (misalnya Samudra Hindia 2012) tidak terpotong di tepi.
  const semua = {
    type: "FeatureCollection" as const,
    features: [
      ...peta.darat.features,
      { type: "Feature" as const, properties: {}, geometry: { type: "MultiPoint" as const, coordinates: k.lon.map((lon, i) => [lon, k.lat[i]]) } },
    ],
  };
  const skala = lebar < 600 ? 0.6 : 1;
  // Ruang tepi selebar lingkaran terbesar, supaya M9 di pinggir tidak terpotong.
  const tepi = Math.ceil(jariJari(9.2, skala)) + 2;
  const proyeksi = geoMercator().fitExtent(
    [
      [tepi, tepi],
      [lebar - tepi, tinggi - tepi],
    ],
    semua,
  );
  const jalur = geoPath(proyeksi);
  wadah.style.height = `${tinggi}px`;
  wadah.innerHTML = `<svg viewBox="0 0 ${lebar} ${tinggi}" aria-hidden="true">
    <path d="${jalur(peta.darat) ?? ""}" fill="var(--darat)"/>
    <path d="${jalur(peta.batas) ?? ""}" fill="none" stroke="var(--darat-garis)" stroke-width="0.4"/>
  </svg>`;
  const dpr = window.devicePixelRatio || 1;
  const c = document.createElement("canvas");
  c.width = lebar * dpr;
  c.height = tinggi * dpr;
  wadah.append(c);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const tampil = [...Array(k.n).keys()].filter((i) => k.mag[i] >= magMin).sort((a, b) => k.mag[a] - k.mag[b]);
  const posisi = new Map<number, [number, number]>();
  const kertas = cssVar("--kertas");
  for (const i of tampil) {
    const p = proyeksi([k.lon[i], k.lat[i]]);
    if (!p) continue;
    posisi.set(i, p as [number, number]);
    ctx.beginPath();
    ctx.arc(p[0], p[1], jariJari(k.mag[i], skala), 0, Math.PI * 2);
    ctx.fillStyle = warnaDalam(k.dalam[i]);
    ctx.globalAlpha = k.mag[i] >= 7 ? 0.95 : 0.55;
    ctx.fill();
    if (k.mag[i] >= 7) {
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.strokeStyle = kertas;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  const tip = buatTip(wadah);
  c.addEventListener("pointermove", (e) => {
    const kotak = c.getBoundingClientRect();
    const mx = e.clientX - kotak.left;
    const my = e.clientY - kotak.top;
    let pilih = -1;
    let skor = Infinity;
    for (const [i, [px, py]] of posisi) {
      const d = Math.hypot(px - mx, py - my);
      if (d > Math.max(8, jariJari(k.mag[i], skala) + 3)) continue;
      // Utamakan yang lebih kuat bila beberapa titik berdekatan.
      const s = d - k.mag[i] * 2;
      if (s < skor) {
        skor = s;
        pilih = i;
      }
    }
    if (pilih < 0) return tip.sembunyi();
    const [px, py] = posisi.get(pilih)!;
    tip.tampil(px, py, isiTip(gempa(k, pilih)));
  });
  c.addEventListener("pointerleave", () => tip.sembunyi());
}

/** Peta kecil sekitar satu daerah: lingkaran radius, daerah disorot, gempa sebagai lingkaran, lima terkuat bernomor. */
export function gambarPetaKecil(wadah: HTMLElement, peta: Peta, d: Daerah, radiusKm: number, daftar: Gempa[]): void {
  const lebar = 560;
  const tinggi = 420;
  const lingkaran = geoCircle()
    .center(d.titik as [number, number])
    .radius((radiusKm * 1.08) / 111.2)();
  const proyeksi = geoMercator().fitExtent(
    [
      [12, 12],
      [lebar - 12, tinggi - 12],
    ],
    lingkaran,
  );
  const jalur = geoPath(proyeksi);
  const batasRadius = geoCircle()
    .center(d.titik as [number, number])
    .radius(radiusKm / 111.2)();
  const fDaerah = peta.darat.features.find((f) => f.properties.id === d.id);
  const urutKecil = [...daftar].sort((a, b) => a.mag - b.mag);
  const lima = daftar.slice(0, 5);
  wadah.innerHTML = `<svg viewBox="0 0 ${lebar} ${tinggi}" role="img" aria-label="Peta gempa dalam radius ${radiusKm} km dari ${esc(d.nama)}">
    <defs><clipPath id="potong"><rect width="${lebar}" height="${tinggi}"/></clipPath></defs>
    <g clip-path="url(#potong)">
      <path d="${jalur(peta.darat) ?? ""}" fill="var(--darat)"/>
      <path d="${jalur(peta.batas) ?? ""}" fill="none" stroke="var(--darat-garis)" stroke-width="0.6"/>
      ${fDaerah ? `<path d="${jalur(fDaerah) ?? ""}" fill="var(--sorot)" fill-opacity="0.25" stroke="var(--sorot)" stroke-width="1.5"/>` : ""}
      <path d="${jalur(batasRadius) ?? ""}" fill="none" stroke="var(--tinta)" stroke-width="1.2" stroke-dasharray="5 4"/>
      ${urutKecil
        .map((g) => {
          const p = proyeksi([g.lon, g.lat]);
          return p ? `<circle cx="${p[0]}" cy="${p[1]}" r="${jariJari(g.mag, 1.3)}" fill="${warnaDalam(g.dalam)}" fill-opacity="0.6"/>` : "";
        })
        .join("")}
      ${lima
        .map((g, n) => {
          const p = proyeksi([g.lon, g.lat]);
          return p
            ? `<circle cx="${p[0]}" cy="${p[1]}" r="10" fill="var(--kertas)" stroke="var(--tinta)" stroke-width="1.2"/><text x="${p[0]}" y="${p[1] + 4}" text-anchor="middle" style="font:600 11px var(--mono);fill:var(--tinta)">${n + 1}</text>`
            : "";
        })
        .join("")}
    </g>
  </svg>`;
}

/* ---------- grafik ---------- */
export function grafikGR(wadah: HTMLElement, titik: { m: number; n: number }[]): void {
  const lebar = Math.max(320, wadah.clientWidth);
  const tinggi = 300;
  const m = { atas: 24, kanan: 10, bawah: 30, kiri: 50 };
  const x = scaleBand<number>()
    .domain(titik.map((t) => t.m))
    .range([m.kiri, lebar - m.kanan])
    .paddingInner(0.25);
  const y = scaleLog()
    .domain([0.8, Math.max(...titik.map((t) => t.n)) * 1.3])
    .range([tinggi - m.bawah, m.atas]);
  const tick = [1, 10, 100, 1000, 10000].filter((v) => v <= y.domain()[1]);
  const w = x.bandwidth();
  wadah.innerHTML = `<svg viewBox="0 0 ${lebar} ${tinggi}" aria-hidden="true">
    <g class="kisi">${tick.map((v) => `<line x1="${m.kiri}" x2="${lebar - m.kanan}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>
    ${tick.map((v) => `<text x="${m.kiri - 6}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? `${v / 1000} rb` : v}</text>`).join("")}
    ${titik
      .map((t) => {
        const yy = y(t.n);
        const x0 = x(t.m)!;
        const h = y(0.8) - yy;
        const r = Math.min(4, w / 2, h);
        return `<path d="M${x0},${y(0.8)}V${yy + r}Q${x0},${yy} ${x0 + r},${yy}H${x0 + w - r}Q${x0 + w},${yy} ${x0 + w},${yy + r}V${y(0.8)}Z" fill="var(--merah)"/>
        <text class="angka-batang" x="${x0 + w / 2}" y="${yy - 6}" text-anchor="middle">${t.n.toLocaleString("id-ID")}</text>
        <text x="${x0 + w / 2}" y="${tinggi - 8}" text-anchor="middle">≥${mag1(t.m)}</text>`;
      })
      .join("")}
  </svg>`;
}

export function grafikTahun(wadah: HTMLElement, perTahun: Map<number, number>): void {
  const lebar = Math.max(320, wadah.clientWidth);
  const tinggi = 260;
  const m = { atas: 22, kanan: 8, bawah: 28, kiri: 40 };
  const tahunAkhir = Math.max(...perTahun.keys());
  const data = Array.from({ length: tahunAkhir - 1900 + 1 }, (_, i) => ({ t: 1900 + i, n: perTahun.get(1900 + i) ?? 0 }));
  const x = scaleBand<number>()
    .domain(data.map((d) => d.t))
    .range([m.kiri, lebar - m.kanan])
    .paddingInner(0.15);
  const maks = Math.max(...data.map((d) => d.n));
  const y = scaleLinear().domain([0, maks * 1.08]).range([tinggi - m.bawah, m.atas]).nice();
  const w = x.bandwidth();
  const tick = y.ticks(4);
  const puncak = data.reduce((a, b) => (b.n > a.n ? b : a));
  wadah.innerHTML = `<svg viewBox="0 0 ${lebar} ${tinggi}" aria-hidden="true">
    <g class="kisi">${tick.map((v) => `<line x1="${m.kiri}" x2="${lebar - m.kanan}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>
    ${tick.map((v) => `<text x="${m.kiri - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
    ${data.map((d) => `<rect x="${x(d.t)}" y="${y(d.n)}" width="${w}" height="${y(0) - y(d.n)}" fill="var(--merah)" fill-opacity="${d.t === puncak.t ? 1 : 0.75}"/>`).join("")}
    ${data
      .filter((d) => d.t % (lebar < 600 ? 25 : 10) === 0)
      .map((d) => `<text x="${x(d.t)! + w / 2}" y="${tinggi - 8}" text-anchor="middle">${d.t}</text>`)
      .join("")}
    <text class="anotasi" x="${x(puncak.t)! - 6}" y="${y(puncak.n) + 4}" text-anchor="end">${puncak.t}: ${puncak.n} gempa</text>
    <rect class="area" x="${m.kiri}" y="${m.atas}" width="${lebar - m.kiri - m.kanan}" height="${tinggi - m.atas - m.bawah}" fill="transparent"/>
  </svg>`;
  const tip = buatTip(wadah);
  const area = wadah.querySelector(".area")!;
  area.addEventListener("pointermove", (e) => {
    const kotak = wadah.querySelector("svg")!.getBoundingClientRect();
    const px = (((e as PointerEvent).clientX - kotak.left) / kotak.width) * lebar;
    const i = Math.max(0, Math.min(data.length - 1, Math.floor((px - m.kiri) / x.step())));
    const d = data[i];
    const s = kotak.width / lebar;
    tip.tampil((x(d.t)! + w / 2) * s, y(d.n) * s, `<b>${d.n}</b> gempa M5+<br><span class="waktu">tahun ${d.t}</span>`);
  });
  area.addEventListener("pointerleave", () => tip.sembunyi());
}
