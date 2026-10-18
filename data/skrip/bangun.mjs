// Bangun data gempa dari katalog USGS (ComCat).
//
//   node data/skrip/bangun.mjs           pakai data/mentah/usgs_m5.csv yang ada
//   node data/skrip/bangun.mjs --unduh   unduh ulang katalog lebih dulu
//
// Keluaran:
//   public/data/gempa.json  kolom-kolom ringkas: waktu, lintang, bujur, kedalaman, magnitudo,
//                           daerah terdekat dan jaraknya (km)
//   src/data/daerah.json    514 kabupaten/kota: nama, provinsi, titik tengah
import { readFileSync, writeFileSync } from "node:fs";

const URL_USGS =
  "https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&minlatitude=-12&maxlatitude=7" +
  "&minlongitude=91&maxlongitude=142&minmagnitude=5&starttime=1900-01-01&orderby=time-asc";
// Gempa yang titik tengah kabupaten/kota Indonesia terdekatnya lebih jauh dari ini
// dianggap di luar jangkauan. Cukup longgar untuk gempa palung lepas pantai
// (Samudra Hindia 2012 berjarak ~430 km dari Banda Aceh, tetapi titik tengah
// Simeulue lebih dekat), lalu gempa yang menurut USGS terjadi di negara tetangga dibuang.
const BATAS_KM = 400;
const NEGARA_LAIN = /Philippines|Papua New Guinea|Malaysia|Australia|Palau|Brunei|Singapore|India|Myanmar|Thailand/i;
const R_BUMI_KM = 6371.0088;

if (process.argv.includes("--unduh")) {
  const r = await fetch(URL_USGS, { headers: { "User-Agent": "getar/1.0 (github.com/Reverseflash45/getar)" } });
  if (!r.ok) throw new Error(`USGS ${r.status}`);
  writeFileSync("data/mentah/usgs_m5.csv", await r.text());
}

/** Pembaca CSV sederhana yang paham tanda kutip (kolom place berisi koma). */
function bacaCsv(teks) {
  const baris = [];
  let kolom = [];
  let isi = "";
  let kutip = false;
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (kutip) {
      if (c === '"' && teks[i + 1] === '"') {
        isi += '"';
        i++;
      } else if (c === '"') kutip = false;
      else isi += c;
    } else if (c === '"') kutip = true;
    else if (c === ",") {
      kolom.push(isi);
      isi = "";
    } else if (c === "\n") {
      kolom.push(isi.replace(/\r$/, ""));
      baris.push(kolom);
      kolom = [];
      isi = "";
    } else isi += c;
  }
  if (isi || kolom.length) baris.push([...kolom, isi]);
  const [kepala, ...data] = baris;
  return data.filter((b) => b.length === kepala.length).map((b) => Object.fromEntries(kepala.map((k, i) => [k, b[i]])));
}

const rad = (d) => (d * Math.PI) / 180;
function jarakKm(lat1, lon1, lat2, lon2) {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R_BUMI_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const daerahTebak = JSON.parse(readFileSync("data/mentah/daerah_tebak.json", "utf8")).daerah;
const daerah = daerahTebak.map((d) => ({ id: d.id, nama: d.nama, prov: d.prov, pulau: d.pulau, titik: d.titik }));

const mentah = bacaCsv(readFileSync("data/mentah/usgs_m5.csv", "utf8"));
const kolom = { t: [], lat: [], lon: [], dalam: [], mag: [], daerah: [], jarak: [] };
const tempat = {}; // nama tempat USGS hanya untuk gempa M7+, untuk daftar terbesar
let dibuang = 0;
for (const g of mentah) {
  if (g.type !== "earthquake") continue;
  const lat = Number(g.latitude);
  const lon = Number(g.longitude);
  const mag = Number(g.mag);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(mag)) continue;
  let terdekat = -1;
  let jarak = Infinity;
  daerah.forEach((d, i) => {
    const j = jarakKm(lat, lon, d.titik[1], d.titik[0]);
    if (j < jarak) {
      jarak = j;
      terdekat = i;
    }
  });
  if (jarak > BATAS_KM || NEGARA_LAIN.test(g.place)) {
    dibuang++;
    continue;
  }
  kolom.t.push(Math.round(Date.parse(g.time) / 1000));
  kolom.lat.push(Math.round(lat * 100) / 100);
  kolom.lon.push(Math.round(lon * 100) / 100);
  // Kedalaman kosong di katalog lama; -1 = tidak diketahui.
  kolom.dalam.push(g.depth === "" ? -1 : Math.round(Number(g.depth)));
  kolom.mag.push(Math.round(mag * 10) / 10);
  kolom.daerah.push(terdekat);
  kolom.jarak.push(Math.round(jarak));
  if (mag >= 7) tempat[kolom.t.length - 1] = g.place;
}

const n = kolom.t.length;
writeFileSync(
  "public/data/gempa.json",
  JSON.stringify({ dibangun: new Date().toISOString().slice(0, 10), sumber: "USGS ComCat", batasKm: BATAS_KM, n, ...kolom, tempat }),
);
writeFileSync("src/data/daerah.json", JSON.stringify({ daerah }) + "\n");
const tahun = kolom.t.map((t) => new Date(t * 1000).getUTCFullYear());
console.log(`${n} gempa (${Math.min(...tahun)}–${Math.max(...tahun)}), ${dibuang} di luar jangkauan/negara lain dibuang`);
console.log(`M6+: ${kolom.mag.filter((m) => m >= 6).length}, M7+: ${kolom.mag.filter((m) => m >= 7).length}, M8+: ${kolom.mag.filter((m) => m >= 8).length}`);
