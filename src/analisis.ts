import dataDaerah from "./data/daerah.json";

export type Daerah = (typeof dataDaerah.daerah)[number];
export const DAERAH: readonly Daerah[] = dataDaerah.daerah;

/** Katalog dalam bentuk kolom (hemat ukuran berkas): indeks yang sama = gempa yang sama. */
export type Katalog = {
  dibangun: string;
  n: number;
  t: number[]; // detik Unix (UTC)
  lat: number[];
  lon: number[];
  dalam: number[]; // km, -1 = tidak diketahui
  mag: number[];
  daerah: number[]; // indeks DAERAH terdekat
  jarak: number[]; // km ke titik tengah daerah terdekat
  tempat: Record<string, string>; // nama tempat USGS, hanya M7+
};

export type Gempa = {
  i: number;
  waktu: Date;
  lat: number;
  lon: number;
  dalam: number;
  mag: number;
  daerah: Daerah;
  jarak: number;
};

export const gempa = (k: Katalog, i: number): Gempa => ({
  i,
  waktu: new Date(k.t[i] * 1000),
  lat: k.lat[i],
  lon: k.lon[i],
  dalam: k.dalam[i],
  mag: k.mag[i],
  daerah: DAERAH[k.daerah[i]],
  jarak: k.jarak[i],
});

const R_BUMI_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;
export function jarakKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R_BUMI_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type KelasDalam = "dangkal" | "menengah" | "dalam" | "?";
/** Pembagian kedalaman yang lazim dipakai BMKG/USGS: dangkal < 70 km, dalam > 300 km. */
export const kelasDalam = (km: number): KelasDalam => (km < 0 ? "?" : km < 70 ? "dangkal" : km <= 300 ? "menengah" : "dalam");

/** Energi relatif: tiap naik 1 magnitudo, energi naik sekitar 31,6 kali (10^1,5). */
export const kaliEnergi = (m1: number, m2: number) => 10 ** (1.5 * (m1 - m2));

/** Semua gempa dalam radius tertentu dari titik tengah sebuah daerah, terkuat dulu. */
export function sekitar(k: Katalog, d: Daerah, radiusKm: number): (Gempa & { jarakKeDaerah: number })[] {
  const [lon, lat] = d.titik;
  const hasil: (Gempa & { jarakKeDaerah: number })[] = [];
  for (let i = 0; i < k.n; i++) {
    // Saringan kasar dengan derajat dulu supaya tidak menghitung haversine untuk semua gempa.
    if (Math.abs(k.lat[i] - lat) * 111 > radiusKm) continue;
    const j = jarakKm(lat, lon, k.lat[i], k.lon[i]);
    if (j <= radiusKm) hasil.push({ ...gempa(k, i), jarakKeDaerah: j });
  }
  return hasil.sort((a, b) => b.mag - a.mag || b.waktu.getTime() - a.waktu.getTime());
}

export type Ringkasan = {
  total: number;
  m6: number;
  m7: number;
  terkuat: Gempa | null;
  terakhir: Gempa | null;
  sejak1970: number;
};

export function ringkas(daftar: Gempa[]): Ringkasan {
  let terakhir: Gempa | null = null;
  for (const g of daftar) if (!terakhir || g.waktu > terakhir.waktu) terakhir = g;
  return {
    total: daftar.length,
    m6: daftar.filter((g) => g.mag >= 6).length,
    m7: daftar.filter((g) => g.mag >= 7).length,
    terkuat: daftar.reduce<Gempa | null>((a, g) => (!a || g.mag > a.mag ? g : a), null),
    terakhir,
    sejak1970: daftar.filter((g) => g.waktu.getUTCFullYear() >= 1970).length,
  };
}

/** Indeks gempa terbesar di seluruh katalog. */
export function terbesar(k: Katalog, jumlah: number): number[] {
  return [...Array(k.n).keys()].sort((a, b) => k.mag[b] - k.mag[a] || k.t[a] - k.t[b]).slice(0, jumlah);
}

/** Jumlah gempa per tahun. */
export function perTahun(k: Katalog, magMin = 5): Map<number, number> {
  const m = new Map<number, number>();
  for (let i = 0; i < k.n; i++) {
    if (k.mag[i] < magMin) continue;
    const th = new Date(k.t[i] * 1000).getUTCFullYear();
    m.set(th, (m.get(th) ?? 0) + 1);
  }
  return m;
}

/**
 * Hukum Gutenberg–Richter: jumlah gempa dengan magnitudo ≥ M, per kelompok 0,5.
 * Dipakai sejak tahun tertentu karena katalog lama hanya mencatat gempa besar.
 */
export function gutenbergRichter(k: Katalog, sejakTahun: number): { m: number; n: number }[] {
  const batas = Date.UTC(sejakTahun, 0, 1) / 1000;
  const hasil: { m: number; n: number }[] = [];
  for (let m = 5; m <= 9; m += 0.5) {
    let n = 0;
    for (let i = 0; i < k.n; i++) if (k.t[i] >= batas && k.mag[i] >= m) n++;
    if (n > 0) hasil.push({ m, n });
  }
  return hasil;
}

/** Kemiringan b (log10 N terhadap M) dengan regresi kuadrat terkecil. */
export function nilaiB(titik: { m: number; n: number }[]): number {
  const xs = titik.map((t) => t.m);
  const ys = titik.map((t) => Math.log10(t.n));
  const rx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const ry = ys.reduce((a, b) => a + b, 0) / ys.length;
  let atas = 0;
  let bawah = 0;
  xs.forEach((x, i) => {
    atas += (x - rx) * (ys[i] - ry);
    bawah += (x - rx) ** 2;
  });
  return -atas / bawah;
}

/** "Kab. Kediri" → "kediri", untuk pencarian. */
export const normal = (s: string) =>
  s
    .toLowerCase()
    .replace(/^(kab\.?|kabupaten|kota)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function cariDaerah(ketik: string, batas = 8): Daerah[] {
  const q = normal(ketik);
  if (!q) return [];
  const kota = /^kota\b/i.test(ketik.trim());
  const kab = /^kab/i.test(ketik.trim());
  return DAERAH.map((d) => {
    if ((kota && !d.nama.startsWith("Kota")) || (kab && !d.nama.startsWith("Kab"))) return { d, s: -1 };
    const n = normal(d.nama);
    return { d, s: n === q ? 3 : n.startsWith(q) ? 2 : n.split(" ").some((w) => w.startsWith(q)) ? 1.5 : n.includes(q) ? 1 : -1 };
  })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.d.nama.localeCompare(b.d.nama, "id"))
    .slice(0, batas)
    .map((x) => x.d);
}
