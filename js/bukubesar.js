import { db } from './firebase-config.js';
import { ref, get, set, push, remove, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { formatRp, toast, cleanNumber, applyMask } from './utils.js';

// Define HAK_AKSES and penggunaLogin for this module
const HAK_AKSES = {
  admin:    { tambah: true,  edit: true,  hapus: true,  kelolaAkun: true },
  pengurus: { tambah: true,  edit: true,  hapus: false, kelolaAkun: false },
  anggota:  { tambah: true,  edit: false, hapus: false, kelolaAkun: false },
  guest:    { tambah: false, edit: false, hapus: false, kelolaAkun: false }
};
let penggunaLogin = null;

async function catatLog(aksi, detail = "") {
  if (!penggunaLogin) return;
  try {
    const logRef = push(ref(db, "logs"));
    await set(logRef, {
      waktu: Date.now(),
      nama: penggunaLogin.username,
      level: penggunaLogin.level,
      aksi: aksi,
      detail: detail
    });
  } catch (e) { console.error("Gagal mencatat log:", e); }
}

// Helper functions for UI
window.bukaModal = (id) => document.getElementById(id).classList.add('aktif');
window.tutupModal = (id) => document.getElementById(id).classList.remove('aktif');
window.bukaSidebar = () => {
  document.getElementById('sidebar').classList.add('buka');
  document.getElementById('overlay-sb').classList.add('aktif');
};
window.tutupSidebar = () => {
  document.getElementById('sidebar').classList.remove('buka');
  document.getElementById('overlay-sb').classList.remove('aktif');
};

// ══ LOGIKA BUKU BESAR (LEDGER) ══
window.renderBukuBesar = async function() {
  const snapshot = await get(ref(db, "transaksi"));
  let list = snapshot.exists() ? Object.entries(snapshot.val()).map(([id, data]) => ({ id, ...data })) : [];

  // 1. Filter berdasarkan kata kunci pencarian (Keterangan/Kategori)
  const cari = (document.getElementById('search-ledger')?.value || '').toLowerCase();
  if (cari) {
    list = list.filter(t => 
      (t.deskripsi || '').toLowerCase().includes(cari) || 
      (t.kategori || '').toLowerCase().includes(cari)
    );
  }

  // Filter berdasarkan range bulan/tahun dari UI
  const mBul = document.getElementById('filter-mulai-bulan')?.value;
  const mTah = document.getElementById('filter-mulai-tahun')?.value;
  const sBul = document.getElementById('filter-sampai-bulan')?.value;
  const sTah = document.getElementById('filter-sampai-tahun')?.value;

  if (mTah || sTah) {
    const startVal = (mTah ? parseInt(mTah) : 1981) * 12 + parseInt(mBul);
    const endVal = (sTah ? parseInt(sTah) : 2100) * 12 + parseInt(sBul);
    list = list.filter(t => {
      const dt = new Date(t.tanggal);
      if (isNaN(dt)) return false;
      const currentVal = dt.getFullYear() * 12 + (dt.getMonth() + 1);
      return currentVal >= startVal && currentVal <= endVal;
    });
  }

  list.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

  const canEdit = HAK_AKSES[penggunaLogin.level]?.edit;
  const canHapus = HAK_AKSES[penggunaLogin.level]?.hapus;
  let html = '', totalMasuk = 0, totalKeluar = 0;

  list.forEach(t => {
    const isMasuk = t.tipe === 'masuk';
    if (isMasuk) totalMasuk += t.jumlah; else totalKeluar += t.jumlah;

    html += `
      <tr>
        <td style="white-space:nowrap">${new Date(t.tanggal).toLocaleDateString('id-ID')}</td>
        <td>${t.deskripsi}<br><small style="color:var(--cb); font-size:0.7rem">Oleh: ${t.inputOleh || 'Admin'}</small></td>
        <td><span class="badge" style="background:rgba(201,168,76,0.1); color:var(--el)">${t.kategori}</span></td>
        <td class="txt-masuk">${isMasuk ? formatRp(t.jumlah) : '-'}</td>
        <td class="txt-keluar">${!isMasuk ? formatRp(t.jumlah) : '-'}</td>
        <td style="text-align:center; white-space:nowrap;">
          ${canEdit ? `<button class="btn-sm" onclick="window.bukaEditTransaksi('${t.id}')">Edit</button>` : ''}
          ${canHapus ? `<button class="btn-sm danger" onclick="window.hapusTransaksi('${t.id}')">Hapus</button>` : ''}
        </td>
      </tr>`;
  });

  const body = document.getElementById('ledger-body');
  if (body) {
    body.innerHTML = html || '<tr><td colspan="6" style="text-align:center; padding:2rem; opacity:0.5">Belum ada transaksi.</td></tr>';
    document.getElementById('ledger-total-masuk').textContent = formatRp(totalMasuk);
    document.getElementById('ledger-total-keluar').textContent = formatRp(totalKeluar);
    const saldo = totalMasuk - totalKeluar;
    document.getElementById('ledger-saldo-akhir').textContent = formatRp(saldo);
    document.getElementById('ledger-saldo-akhir').style.color = saldo >= 0 ? 'var(--em)' : '#e8a0a0';
  }
};

window.resetFilterBukuBesar = function() {
  const now = new Date();
  const searchEl = document.getElementById('search-ledger');
  if (searchEl) searchEl.value = '';
  
  document.getElementById('filter-mulai-bulan').value = '01';
  document.getElementById('filter-mulai-tahun').value = '';
  document.getElementById('filter-sampai-bulan').value = String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('filter-sampai-tahun').value = '';
  window.renderBukuBesar();
};

window.resetTrxForm = function() {
  document.getElementById('trx-id').value = '';
  document.getElementById('trx-tanggal').value = new Date().toISOString().split('T')[0];
  document.getElementById('trx-deskripsi').value = '';
  document.getElementById('trx-jumlah').value = '';
  document.getElementById('trx-kategori').value = 'Sosial';
  const radioMasuk = document.querySelector('input[name="trx-tipe"][value="masuk"]');
  if(radioMasuk) radioMasuk.checked = true;
  document.getElementById('modal-trx-judul').textContent = 'Tambah Transaksi';
};

window.simpanTransaksi = async function() {
  const id = document.getElementById('trx-id').value;
  const tgl = document.getElementById('trx-tanggal').value;
  const dsk = document.getElementById('trx-deskripsi').value.trim();
  const jml = cleanNumber(document.getElementById('trx-jumlah').value);
  const kat = document.getElementById('trx-kategori').value;
  const tip = document.querySelector('input[name="trx-tipe"]:checked').value;

  if (!tgl || !dsk || isNaN(jml)) return toast('Harap isi semua field transaksi.');

  const trxData = {
    tanggal: tgl, deskripsi: dsk, jumlah: jml, kategori: kat, tipe: tip,
    inputOleh: penggunaLogin.nama, updatedAt: Date.now()
  };

  if (!id) {
    const newTrxRef = push(ref(db, "transaksi"));
    trxData.createdAt = Date.now();
    await set(newTrxRef, trxData);
  } else {
    await set(ref(db, `transaksi/${id}`), trxData);
  }

  window.tutupModal('modal-transaksi');
  toast(id ? 'Transaksi diperbarui.' : 'Transaksi dicatat.');
  catatLog(id ? "Edit Keuangan" : "Tambah Keuangan", dsk + " (" + formatRp(jml) + ")");
  window.renderBukuBesar();
};

window.bukaEditTransaksi = async function(id) {
  const snapshot = await get(ref(db, `transaksi/${id}`));
  if (!snapshot.exists()) return;
  const t = snapshot.val();
  document.getElementById('trx-id').value = id;
  document.getElementById('trx-tanggal').value = t.tanggal;
  document.getElementById('trx-deskripsi').value = t.deskripsi;
  document.getElementById('trx-jumlah').value = t.jumlah ? t.jumlah.toLocaleString('id-ID') : '';
  document.getElementById('trx-kategori').value = t.kategori;
  const radio = document.querySelector(`input[name="trx-tipe"][value="${t.tipe}"]`);
  if(radio) radio.checked = true;
  document.getElementById('modal-trx-judul').textContent = 'Edit Transaksi';
  window.bukaModal('modal-transaksi');
};

window.hapusTransaksi = async function(id) {
  if (!confirm('Hapus transaksi ini?')) return;
  await remove(ref(db, `transaksi/${id}`));
  toast('Transaksi dihapus.');
  catatLog("Hapus Keuangan", "ID Transaksi: " + id);
  window.renderBukuBesar();
};

window.hapusSemuaTransaksi = async function() {
  if (!HAK_AKSES[penggunaLogin.level]?.hapus) return toast('Hanya Admin yang dapat menghapus seluruh data.');
  if (!confirm('PERINGATAN: Ini akan menghapus SELURUH catatan di Buku Besar secara permanen. Lanjutkan?')) return;
  
  try {
    await remove(ref(db, "transaksi"));
    toast('Buku Besar berhasil dibersihkan.');
    catatLog("Bersihkan Buku Besar", "Menghapus seluruh data transaksi keuangan");
    window.renderBukuBesar();
  } catch (e) {
    console.error(e);
    toast('Gagal membersihkan data.');
  }
};

window.importLedgerFile = function() {
  if(!penggunaLogin) return toast('Silakan masuk terlebih dahulu sebelum mengimpor data.');
  document.getElementById('input-import-excel').click();
};

window.handleImportLedgerFile = async function(input) {
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();

  reader.onload = async function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const result = await parseLedgerRows(rows);
      if(result.count === 0) return toast('Tidak ditemukan baris transaksi valid pada file.');

      await Promise.all(result.entries.map(async trx => {
        const newTrxRef = push(ref(db, "transaksi"));
        await set(newTrxRef, trx);
      }));
      window.tutupModal('modal-transaksi'); // Assuming this modal is for adding single transaction, not import
      catatLog("Import Keuangan", "Berhasil mengimpor " + result.count + " transaksi dari file");
      toast(result.count + ' transaksi berhasil diimpor ke buku besar.');
      window.renderBukuBesar();
    } catch (err) {
      console.error(err);
      toast('Gagal mengimpor file. Pastikan format Excel atau CSV benar.');
    } finally {
      input.value = '';
    }
  };

  reader.readAsArrayBuffer(file);
};

async function parseLedgerRows(rows) {
  if(!rows || rows.length < 2) return { count: 0, entries: [] };
  const header = rows[0].map(h => (h || '').toString().trim().toLowerCase());
  const idx = {
    tanggal: header.findIndex(h => /tanggal|date|tgl/.test(h)),
    deskripsi: header.findIndex(h => /keterangan|description|uraian|detail|transaksi/.test(h)),
    kategori: header.findIndex(h => /kategori|category|jenis|tipe/.test(h)),
    masuk: header.findIndex(h => /masuk|debit|penerimaan|penerima|income/.test(h)),
    keluar: header.findIndex(h => /keluar|kredit|pengeluaran|bayar|expense/.test(h)),
    jumlah: header.findIndex(h => /jumlah|nominal|amount/.test(h))
  };

  const entries = [];

  function parseNumber(value) {
    if(value === null || value === undefined || value === '') return NaN;
    if(typeof value === 'string') {
      value = value.replace(/[^0-9\-,.]/g, '').replace(/\./g, '').replace(/,/g, '.');
    }
    return Number(value);
  }

  function parseDate(value) {
    if(!value && value !== 0) return null;
    if(value instanceof Date) return value;
    if(typeof value === 'number') {
      const dateCode = XLSX.SSF.parse_date_code(value);
      if(dateCode) {
        return new Date(Date.UTC(dateCode.y, dateCode.m - 1, dateCode.d, dateCode.H, dateCode.M, dateCode.S));
      }
      return null;
    }
    const text = value.toString().trim();
    const iso = text.replace(/\s/g, '');
    const d = new Date(iso);
    if(!isNaN(d)) return d;
    const parts = text.split(/[\.\/\-]/).map(p => parseInt(p, 10));
    if(parts.length >= 3) {
      if(parts[0] > 31) return new Date(parts[0], parts[1]-1, parts[2]);
      return new Date(parts[2], parts[1]-1, parts[0]);
    }
    return null;
  }

  function formatIso(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth()+1).padStart(2,'0');
    const dd = String(date.getDate()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}`;
  }

  for(let i=1;i<rows.length;i++) {
    const row = rows[i];
    if(!row || row.length === 0) continue;
    const tanggal = idx.tanggal >= 0 ? row[idx.tanggal] : null;
    const deskripsi = idx.deskripsi >= 0 ? row[idx.deskripsi] : row[idx.kategori] || '';
    const kategori = idx.kategori >= 0 ? row[idx.kategori] : 'Lain-lain';
    const masukRaw = idx.masuk >= 0 ? row[idx.masuk] : NaN;
    const keluarRaw = idx.keluar >= 0 ? row[idx.keluar] : NaN;
    const jumlahRaw = idx.jumlah >= 0 ? row[idx.jumlah] : NaN;

    const masuk = parseNumber(masukRaw);
    const keluar = parseNumber(keluarRaw);
    const jumlah = parseNumber(jumlahRaw);
    let tipe = 'masuk';
    let nilai = NaN;

    if(!isNaN(masuk) && masuk > 0) {
      nilai = masuk;
      tipe = 'masuk';
    }
    if(!isNaN(keluar) && keluar > 0) {
      nilai = keluar;
      tipe = 'keluar';
    }
    if(isNaN(nilai) && !isNaN(jumlah)) {
      nilai = Math.abs(jumlah);
      tipe = jumlah < 0 ? 'keluar' : 'masuk';
    }
    if(isNaN(nilai) || !deskripsi) continue;
    const parsedDate = parseDate(tanggal);
    if(!parsedDate) continue;

    entries.push({
      tanggal: formatIso(parsedDate),
      deskripsi: deskripsi.toString().trim(),
      kategori: kategori ? kategori.toString().trim() : 'Umum',
      jumlah: Math.round(nilai),
      tipe,
      inputOleh: penggunaLogin.nama,
      createdAt: Date.now()
    });
  }

  return { count: entries.length, entries };
}

function initBukuBesarPage() {
  const saved = sessionStorage.getItem('kromoredjo_user');
  if (saved) {
    penggunaLogin = JSON.parse(saved);

    // Proteksi akses: Anggota tidak boleh melihat halaman ini
    if (penggunaLogin.level === 'anggota') {
      window.location.href = 'dashboard.html';
      return;
    }

    // Setup UI based on level
    const levelMap = { admin: '👑 Admin', pengurus: '🛡️ Pengurus', anggota: '🔑 Anggota', guest: '👤 Tamu' };
    const roleText = levelMap[penggunaLogin.level] || '';
    document.getElementById('sidebar-level').textContent = roleText; // Menambahkan ikon ke footer sidebar
    document.getElementById('topbar-user').innerHTML = `${roleText}<br>${penggunaLogin.username}`; // Menggunakan username dan menambahkan ikon
    document.getElementById('btn-keluar-sidebar').style.display = 'block';
    // Hide login button if already logged in
    const btnLoginSidebar = document.getElementById('btn-login-sidebar');
    if (btnLoginSidebar) btnLoginSidebar.style.display = 'none';

    const btnClearLedger = document.getElementById('btn-bersihkan-ledger');
    if(btnClearLedger) btnClearLedger.style.display = HAK_AKSES[penggunaLogin.level]?.hapus ? 'inline-block' : 'none';

    applyMask('trx-jumlah');

    // Start real-time listener for transactions
    onValue(ref(db, "transaksi"), () => {
      window.renderBukuBesar();
    });
    window.renderBukuBesar(); // Initial render
  } else {
    // Redirect to dashboard login if not logged in
    window.location.href = 'dashboard.html';
  }
}

window.keluar = function() {
  sessionStorage.removeItem('kromoredjo_user');
  window.location.href = 'dashboard.html'; // Redirect to dashboard login
};

window.tampilLogin = function() {
  window.location.href = 'dashboard.html'; // Redirect to dashboard login
};

window.addEventListener('load', initBukuBesarPage);