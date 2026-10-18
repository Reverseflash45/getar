import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DAERAH,
  type Katalog,
  cariDaerah,
  gempa,
  gutenbergRichter,
  kaliEnergi,
  kelasDalam,
  nilaiB,
  perTahun,
  ringkas,
  sekitar,
  terbesar,
} from "./analisis";

const k = JSON.parse(readFileSync("public/data/gempa.json", "utf8")) as Katalog;
const daerah = (id: string) => DAERAH.find((d) => d.id === id)!;

describe("katalog", () => {
  it("kolom sama panjang dan nilainya masuk akal", () => {
    for (const c of ["t", "lat", "lon", "dalam", "mag", "daerah", "jarak"] as const) expect(k[c]).toHaveLength(k.n);
    for (let i = 0; i < k.n; i++) {
      expect(k.mag[i]).toBeGreaterThanOrEqual(5);
      expect(k.jarak[i]).toBeLessThanOrEqual(400);
      expect(DAERAH[k.daerah[i]]).toBeDefined();
    }
  });

  it("urut waktu", () => {
    for (let i = 1; i < k.n; i++) expect(k.t[i]).toBeGreaterThanOrEqual(k.t[i - 1]);
  });

  it("gempa terbesar adalah Aceh 2004 M9,1, dan Samudra Hindia 2012 ikut tercatat", () => {
    const [satu, ...lain] = terbesar(k, 5).map((i) => gempa(k, i));
    expect(satu.mag).toBe(9.1);
    expect(satu.waktu.toISOString().slice(0, 10)).toBe("2004-12-26");
    expect(lain.some((g) => g.waktu.toISOString().startsWith("2012-04-11") && g.mag === 8.6)).toBe(true);
  });
});

describe("analisis", () => {
  it("kelas kedalaman", () => {
    expect(kelasDalam(10)).toBe("dangkal");
    expect(kelasDalam(70)).toBe("menengah");
    expect(kelasDalam(301)).toBe("dalam");
    expect(kelasDalam(-1)).toBe("?");
  });

  it("energi M7 sekitar 31,6× M6 dan 1000× M5", () => {
    expect(kaliEnergi(7, 6)).toBeCloseTo(31.62, 1);
    expect(kaliEnergi(7, 5)).toBeCloseTo(1000, 0);
  });

  it("sekitar Kab. Simeulue: terkuat M9,1 (2004) dalam radius 200 km", () => {
    const daftar = sekitar(k, daerah("kab-simeulue"), 200);
    const r = ringkas(daftar);
    expect(r.terkuat?.mag).toBe(9.1);
    expect(r.total).toBeGreaterThan(100);
    expect(daftar.every((g) => g.jarakKeDaerah <= 200)).toBe(true);
    // terkuat dulu
    for (let i = 1; i < daftar.length; i++) expect(daftar[i].mag).toBeLessThanOrEqual(daftar[i - 1].mag);
  });

  it("radius lebih besar tidak pernah mengurangi jumlah", () => {
    const d = daerah("kota-kediri");
    expect(sekitar(k, d, 300).length).toBeGreaterThanOrEqual(sekitar(k, d, 100).length);
  });

  it("jumlah per tahun menjumlah ke total", () => {
    const total = [...perTahun(k).values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(k.n);
  });

  it("Gutenberg–Richter turun dan nilai b mendekati 1", () => {
    const gr = gutenbergRichter(k, 1990);
    for (let i = 1; i < gr.length; i++) expect(gr[i].n).toBeLessThanOrEqual(gr[i - 1].n);
    const b = nilaiB(gr.filter((x) => x.m <= 7.5));
    expect(b).toBeGreaterThan(0.7);
    expect(b).toBeLessThan(1.4);
  });

  it("cari daerah", () => {
    expect(cariDaerah("kota kediri").map((d) => d.id)).toEqual(["kota-kediri"]);
    expect(cariDaerah("palu").map((d) => d.id)).toContain("kota-palu");
  });
});
