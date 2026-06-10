import { db } from './firebase-config.js';
import { ref, get, set, push, remove, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { formatRp, toast, cleanNumber, applyMask } from './utils.js';

// 1. KONFIGURASI AKUN MASTER & HAK AKSES
const AKUN_MASTER = [
  { username: 'admin',    password: 'kromoredjo1981', nama: 'Admin Paguyuban', level: 'admin' },
  { username: 'pengurus', password: 'paguyuban',      nama: 'Pengurus',        level: 'pengurus' }
];

const HAK_AKSES = {
  admin:    { tambah: true,  edit: true,  hapus: true,  kelolaAkun: true },
  pengurus: { tambah: true,  edit: true,  hapus: false, kelolaAkun: false },
  anggota:  { tambah: true,  edit: false, hapus: false, kelolaAkun: false },
  guest:    { tambah: false, edit: false, hapus: false, kelolaAkun: false }
};

let penggunaLogin = null;
let filterAktif = 'semua', idHapusPending = null, semuaTerbuka = false;

// 2. FUNGSI DATABASE UTAMA
window.ambilData = async function() {
  const snapshot = await get(ref(db, "anggota"));
  return snapshot.exists() ? Object.values(snapshot.val()) : [];
};

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

async function simpanSatu(anggota) {
  await set(ref(db, "anggota/" + anggota.id), anggota);
}

// 3. LOGIKA LOGIN
window.handleLogin = async function() {
  const uInput = document.getElementById('input-username').value.trim().toLowerCase();
  const pInput = document.getElementById('input-pass').value;
  
  // Cek Akun Master
  const master = AKUN_MASTER.find(a => a.username.toLowerCase() === uInput && a.password === pInput);
  if (master) return proceedLogin(master);

  // Cek Anggota di Firebase
  const data = await window.ambilData();
  const user = data.find(m => 
    m.panggilan && m.panggilan.toLowerCase() === uInput && m.password === pInput
  );

  if (user) {
    proceedLogin({
      id: user.id,
      username: user.panggilan,
      nama: user.nama,
      level: user.level || 'anggota'
    });
  } else {
    document.getElementById('pesan-error').style.display = 'block';
    toast("Login Gagal: Username atau Password salah.");
  }
};

function proceedLogin(akun) {
  penggunaLogin = akun;
  sessionStorage.setItem('kromoredjo_user', JSON.stringify(akun));
  document.getElementById('halaman-login').classList.remove('aktif');
  document.getElementById('halaman-app').classList.add('aktif');
  
  // Setup UI berdasarkan level
  const levelMap = { admin: '👑 Admin', pengurus: '🛡️ Pengurus', anggota: '🔑 Anggota', guest: '👤 Tamu' };
  const roleText = levelMap[akun.level] || akun.level;
  document.getElementById('nav-pengurus').style.display = 'block';
  document.getElementById('btn-keluar-sidebar').style.display = 'block';
  document.getElementById('sidebar-level').textContent = roleText;
  document.getElementById('topbar-user').innerHTML = `${roleText}<br>${akun.username}`;
  
  const canAdd = HAK_AKSES[akun.level]?.tambah;
  if(document.getElementById('btn-tambah-anggota')) 
    document.getElementById('btn-tambah-anggota').style.display = canAdd ? 'flex' : 'none';

  const navLogs = document.getElementById('nav-logs');
  if(navLogs) navLogs.style.display = akun.level === 'admin' ? 'block' : 'none';

  const navBukuBesar = document.getElementById('nav-bukubesar');
  if(navBukuBesar) navBukuBesar.style.display = akun.level === 'anggota' ? 'none' : 'flex';

  const navLaporan = document.getElementById('nav-laporan');
  // Kontrol visibilitas sub-laporan untuk anggota
  const isAnggota = akun.level === 'anggota';

  // Kontrol visibilitas sub-manajemen arisan untuk anggota (Dashboard)
  ['sub-nav-iuran-arisan', 'sub-nav-pengeluaran-arisan', 'sub-nav-tipe-arisan', 'sub-nav-penerima-arisan'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isAnggota ? 'none' : 'flex';
  });

  ['sub-nav-iuran', 'sub-nav-pengeluaran', 'sub-nav-siklus', 'sub-nav-putaran'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isAnggota ? 'none' : 'flex';
  });

  const btnClearLedger = document.getElementById('btn-bersihkan-ledger');
  if(btnClearLedger) btnClearLedger.style.display = HAK_AKSES[akun.level]?.hapus ? 'inline-block' : 'none';

  const accessBox = document.getElementById('dash-admin-access');
  if(accessBox) accessBox.style.display = akun.level === 'admin' ? 'block' : 'none';

  const btnClearLogs = document.getElementById('btn-bersihkan-log');
  if(btnClearLogs) btnClearLogs.style.display = akun.level === 'admin' ? 'inline-block' : 'none';

  applyMask('input-nominal');
  applyMask('trx-jumlah');

  startRealtimeStats();
  toast('Selamat datang, ' + akun.nama);
  catatLog("Login", "Masuk ke aplikasi");
}

window.toggleArisanSubmenu = function() {
  const submenu = document.getElementById('arisan-submenu');
  const chevron = document.getElementById('arisan-chevron');
  const isClosed = !submenu.style.maxHeight || submenu.style.maxHeight === '0px';
  
  if (isClosed) {
    submenu.style.maxHeight = '500px';
    submenu.style.opacity = '1';
    submenu.style.marginBottom = '0.5rem';
    chevron.style.transform = 'rotate(0deg)';
  } else {
    submenu.style.maxHeight = '0px';
    submenu.style.opacity = '0';
    submenu.style.marginBottom = '0';
    chevron.style.transform = 'rotate(-90deg)';
  }
};

window.toggleLaporanSubmenu = function() {
  const submenu = document.getElementById('laporan-submenu');
  const chevron = document.getElementById('laporan-chevron');
  const isClosed = !submenu.style.maxHeight || submenu.style.maxHeight === '0px';

  if (isClosed) {
    submenu.style.maxHeight = '500px';
    submenu.style.opacity = '1';
    submenu.style.marginBottom = '0.5rem';
    chevron.style.transform = 'rotate(0deg)';
  } else {
    submenu.style.maxHeight = '0px';
    submenu.style.opacity = '0';
    submenu.style.marginBottom = '0';
    chevron.style.transform = 'rotate(-90deg)';
  }
};

function renderAccessCards(dataAnggota) {
  const body = document.getElementById('access-table-body');
  if (!body || penggunaLogin?.level !== 'admin') return;

  let html = '';
  // 1. Tampilkan Akun Master Statis
  AKUN_MASTER.forEach(a => {
    html += `
      <tr>
        <td style="padding: 0.7rem 0.8rem; border-bottom: 1px solid rgba(201,168,76,0.1); font-size: 0.75rem; vertical-align: middle;"><strong>${a.nama}</strong><br><small style="opacity:0.6;">@${a.username}</small></td>
        <td style="padding: 0.7rem 0.8rem; border-bottom: 1px solid rgba(201,168,76,0.1); vertical-align: middle;"><span class="badge" style="background:var(--em); color:var(--ct); font-size:0.55rem; padding: 2px 6px; border-radius:4px; font-family:'Cinzel'; font-weight:bold;">${a.level.toUpperCase()}</span></td>
        <td style="padding: 0.7rem 0.8rem; border-bottom: 1px solid rgba(201,168,76,0.1); font-size: 0.65rem; opacity: 0.7; font-style: italic; vertical-align: middle;">Akun Master Sistem</td>
      </tr>`;
  });

  // 2. Tampilkan Anggota yang memiliki akses login
  dataAnggota.filter(a => a.bolehDaftar).forEach(a => {
    html += `
      <tr>
        <td style="padding: 0.7rem 0.8rem; border-bottom: 1px solid rgba(201,168,76,0.1); font-size: 0.75rem; vertical-align: middle;"><strong>${a.panggilan || a.nama}</strong></td>
        <td style="padding: 0.7rem 0.8rem; border-bottom: 1px solid rgba(201,168,76,0.1); vertical-align: middle;"><span class="badge" style="background:rgba(201,168,76,0.1); color:var(--em); font-size:0.55rem; padding: 2px 6px; border:1px solid rgba(201,168,76,0.3); border-radius:4px; font-family:'Cinzel'; font-weight:bold;">${(a.level || 'anggota').toUpperCase()}</span></td>
        <td style="padding: 0.7rem 0.8rem; border-bottom: 1px solid rgba(201,168,76,0.1); font-size: 0.65rem; opacity: 0.7; font-style: italic; vertical-align: middle;">Anggota Trah</td>
      </tr>`;
  });
  body.innerHTML = html;
}

window.keluar = function() {
  sessionStorage.removeItem('kromoredjo_user');
  window.location.reload();
};

// ══ LOGIKA ARISAN & PERIODE ══
window.bukaSettingNominal = async function() {
    const snap = await get(ref(db, "settings/arisan"));
    const n = snap.exists() ? snap.val().nominal : 0;
    const inputNominal = document.getElementById('input-nominal');
    if(inputNominal) inputNominal.value = n ? n.toLocaleString('id-ID') : '';
    window.bukaModal('modal-nominal');
};

window.simpanNominal = async function() {
    const n = cleanNumber(document.getElementById('input-nominal').value);
    if(!n || n < 1) return toast('Masukkan nominal valid.');
    await set(ref(db, "settings/arisan"), { nominal: n });
    await window.updateLabelNominal();
    catatLog("Update Iuran", "Mengubah nominal iuran menjadi " + formatRp(n));
    window.tutupModal('modal-nominal');
    toast('Nominal iuran disimpan.');
    
    // Reset tampilan daftar anggota ke semula
    filterAktif = 'semua';
    semuaTerbuka = false;
    const searchInput = document.getElementById('search-anggota');
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('aktif'));
    const btnSemua = document.querySelector('.fbtn[onclick*="semua"]');
    if (btnSemua) btnSemua.classList.add('aktif');
    window.renderAnggota();
};

window.updateLabelNominal = async function() {
    const snap = await get(ref(db, "settings/arisan"));
    const n = snap.exists() ? snap.val().nominal : 0;
    const label = document.getElementById('label-nominal');
    if(label) label.textContent = n ? formatRp(n) : 'Belum diatur';
};

window.bukaBuatPeriode = function() {
    const now = new Date();
    document.getElementById('input-bulan').value = now.getMonth() + 1;
    document.getElementById('input-tahun').value = now.getFullYear();
    window.bukaModal('modal-periode');
};

window.simpanPeriode = async function() {
    const bulan = document.getElementById('input-bulan').value;
    const tahun = document.getElementById('input-tahun').value;
    const key = `${tahun}_${bulan}`;
    
    const snap = await get(ref(db, "arisan"));
    const arisan = snap.val() || {};
    if(arisan[key]) return toast('Periode sudah ada.');

    const dataAnggota = await window.ambilData();
    const aktif = dataAnggota.filter(a => a.kehidupan !== 'wafat' && a.status === 'aktif');
    
    const pData = {
        id: key, bulan, tahun, status: 'berjalan', pemenang: null,
        pembayaran: aktif.map(a => ({ id: a.id, nama: a.nama, generasi: a.generasi, lunas: false }))
    };
    await set(ref(db, "arisan/" + key), pData);
    window.tutupModal('modal-periode');
    catatLog("Buat Arisan", "Membuka periode arisan " + key);
    await window.renderPeriode();
    toast('Periode arisan dibuat.');
};

window.renderPeriode = async function() {
    await window.updateLabelNominal();
    const snap = await get(ref(db, "arisan"));
    const arisan = snap.val() || {};
    const keys = Object.keys(arisan).sort().reverse();
    const container = document.getElementById('daftar-periode');
    if(!container) return;
    
    if(!keys.length) {
        container.innerHTML = '<div class="kosong-info">Belum ada periode arisan.</div>';
        return;
    }
    
    const nominalSnap = await get(ref(db, "settings/arisan"));
    const nominal = nominalSnap.exists() ? nominalSnap.val().nominal : 0;

    container.innerHTML = `<div class="periode-grid">${keys.map(k => kartuPeriode(arisan[k], nominal)).join('')}</div>`;
};

function kartuPeriode(p, nominal) {
    const list = p.pembayaran || [];
    const lunas = list.filter(x => x.lunas).length;
    const total = list.length;
    const pct = total ? Math.round(lunas/total*100) : 0;
    const selesai = p.status === 'selesai';
    const BULAN_NM = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    return `
      <div class="periode-card ${selesai ? '' : 'aktif-periode'}">
        <div class="periode-header">
          <p class="periode-bulan">${BULAN_NM[p.bulan]} ${p.tahun}</p>
          <span class="periode-badge ${p.status}">${selesai ? 'Selesai' : 'Berjalan'}</span>
        </div>
        <div class="periode-stats" style="display:flex; gap:10px; font-size:0.8rem; margin-bottom:10px;">
            <span>Lunas: ${lunas}</span> <span>Belum: ${total-lunas}</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="periode-aksi" style="margin-top:10px;">
            <button class="btn-sm solid" onclick="window.bukaDetail('${p.id}')">Detail</button>
        </div>
      </div>`;
}

window.bukaDetail = async function(id) {
    const snap = await get(ref(db, `arisan/${id}`));
    if(!snap.exists()) return;
    const p = snap.val();
    document.getElementById('detail-judul').textContent = `Detail Arisan ${id}`;
    const tbody = document.getElementById('tabel-bayar-body');
    const list = p.pembayaran || [];
    
    tbody.innerHTML = list.map(x => `
        <tr>
            <td>${x.nama}</td>
            <td>Gen ${x.generasi}</td>
            <td>
                <span class="status-bayar ${x.lunas ? 'lunas' : 'belum'}" 
                      onclick="${p.status !== 'selesai' ? `window.toggleBayar('${id}','${x.id}')` : ''}">
                    ${x.lunas ? 'Lunas' : 'Belum'}
                </span>
            </td>
        </tr>
    `).join('');
    window.bukaModal('modal-detail');
};

window.toggleBayar = async function(pid, aid) {
    const snap = await get(ref(db, `arisan/${pid}`));
    const p = snap.val();
    const list = p.pembayaran || [];
    const item = list.find(x => String(x.id) === String(aid));
    if(item) item.lunas = !item.lunas;
    await set(ref(db, `arisan/${pid}`), p);
    catatLog("Update Bayar", `Mengubah status bayar ${item.nama} pada periode ${pid}`);
    window.bukaDetail(pid);
    window.renderPeriode();
};

// 4. LOGIKA IZIN AKSES (OTOMATIS PASSWORD)
window.toggleIzinDaftar = async function(id, val) {
  if (!HAK_AKSES[penggunaLogin.level]?.kelolaAkun) return toast("Hanya Admin yang bisa memberi akses.");
  
  const d = await window.ambilData();
  const a = d.find(x => String(x.id) === String(id));
  if(!a) return;

  if (val) {
    // Cegah pemberian akses jika anggota sudah wafat
    if (a.kehidupan === 'wafat') {
      toast("Gagal: Anggota yang sudah wafat tidak dapat diberi izin akses.");
      window.renderAnggota(); // Render ulang untuk meriset UI checkbox
      return;
    }
    const tgl = a.tanggalLahir || a.lahir;
    if (!tgl || !a.panggilan) {
      alert('Gagal: Anggota harus punya Nama Panggilan dan Tgl Lahir untuk membuat password otomatis.');
      window.renderAnggota(); 
      return;
    }
    
    // Generate: panggilan + tahun lahir (contoh: budi1990)
    const tahun = tgl.split('-')[0];
    a.password = a.panggilan.toLowerCase() + tahun;
    a.level = a.level || 'anggota';
    a.bolehDaftar = true;
    toast('Akses Aktif! Username: ' + a.panggilan + ', Pass: ' + a.password);
    catatLog("Akses Login", "Memberikan izin login ke " + a.nama);
  } else {
    a.bolehDaftar = false;
    a.password = null;
    toast('Akses login dicabut.');
  }

  await simpanSatu(a);
  window.renderAnggota();
};

window.updateLevelAnggota = async function(id, newLevel) {
  if (!HAK_AKSES[penggunaLogin.level]?.kelolaAkun) return toast("Hanya Admin yang bisa mengelola level.");
  
  const d = await window.ambilData();
  const a = d.find(x => String(x.id) === String(id));
  if(!a) return;

  a.level = newLevel;
  await simpanSatu(a);
  window.renderAnggota();
  toast(`Level ${a.nama} diperbarui menjadi ${newLevel.toUpperCase()}.`);
};

// 5. UI & RENDER
window.renderAnggota = async function() {
  const data = await window.ambilData();
  const cari = (document.getElementById('search-anggota')?.value || '').toLowerCase();
  const container = document.getElementById('daftar-anggota');

  // Fungsi pembantu untuk cek apakah anggota adalah jalur keturunan (Trah)
  const isTrah = (p) => !!(p.parentId || p.idOrangTua || String(p.generasi) === '0');

  // Logika Pengurutan Silsilah (Lineage Sorting)
  const getLineageKey = (m) => {
    let path = [], cur = m;
    while (cur) {
      // Jika anggota saat ini adalah Menantu, lompat ke pasangan Trah-nya untuk mendapatkan jalur silsilah yang benar
      if (!isTrah(cur)) {
        const sId = cur.idPasangan || cur.spouseId;
        const spouse = data.find(x => String(x.id) === String(sId));
        if (spouse) cur = spouse;
        else { // Jika tidak ada pasangan trah, gunakan urutan sendiri dan berhenti
          const uVal = parseInt(cur.urutan || cur.urutan_anak);
          path.unshift((isNaN(uVal) ? 99 : uVal).toString().padStart(3, '0'));
          break;
        }
      }

      const uVal = parseInt(cur.urutan || cur.urutan_anak);
      path.unshift((isNaN(uVal) ? 99 : uVal).toString().padStart(3, '0'));
      const pid = cur.idOrangTua || cur.parentId;
      cur = pid ? data.find(x => String(x.id) === String(pid)) : null;
    }
    return path.join('-');
  };

  const filtered = data
    .filter(a => {
      const checkMatch = (p) => !cari || p.nama.toLowerCase().includes(cari) || (p.panggilan || '').toLowerCase().includes(cari);
      let isMatch = checkMatch(a);
      
      // Tetap tampilkan jika pasangannya yang cocok dengan pencarian (agar stack tetap utuh)
      const sId = a.idPasangan || a.spouseId;
      if (!isMatch && sId) {
        const spouseObj = data.find(m => String(m.id) === String(sId));
        if (spouseObj && checkMatch(spouseObj)) isMatch = true;
      }
      
      const matchGen = filterAktif === 'semua' ? true : (filterAktif === 'wafat' ? a.kehidupan === 'wafat' : a.generasi == filterAktif);
      return isMatch && matchGen;
    })
    .sort((a, b) => getLineageKey(a).localeCompare(getLineageKey(b)));

  if (!filtered.length) {
    container.innerHTML = '<div class="kosong-info">Data tidak ditemukan.</div>';
    return;
  }

  const perGen = {};
  if (filterAktif === 'wafat') {
    perGen['wafat'] = filtered;
  } else {
    filtered.forEach(a => {
      if (!perGen[a.generasi]) perGen[a.generasi] = [];
      perGen[a.generasi].push(a);
    });
  }

  let htmlOutput = '';
  Object.keys(perGen).sort().forEach(g => {
    let genCardsHtml = '';
    const renderedIds = new Set();
    const members = perGen[g];
    let lastParentId = null;
    let familyContentHtml = '';

    members.forEach(a => {
      if (renderedIds.has(a.id)) return;

      const isMale = (p) => p.gender === 'L' || p.jenisKelamin === 'L' || p.gender === 'Laki-laki';

      // Mencari Pasangan untuk Stacking
      // Matikan stacking jika filter "Wafat" aktif agar tidak membawa pasangan yang masih hidup ke kategori wafat
      const partners = filterAktif === 'wafat' ? [] : data.filter(m => {
        if (m.id === a.id) return false;
        const sIdA = a.idPasangan || a.spouseId;
        const sIdM = m.idPasangan || m.spouseId;
        return (sIdA && String(m.id) === String(sIdA)) || (sIdM && String(a.id) === String(sIdM));
      });

      let stack = partners.length > 0 ? [a, ...partners] : [a];
      // Urutkan stack: Trah di depan, lalu Laki-laki di depan
      stack.sort((x, y) => {
        const xT = isTrah(x), yT = isTrah(y);
        if (xT !== yT) return xT ? -1 : 1;
        return isMale(x) ? -1 : 1;
      });

      const mainMember = stack[0];
      let pId = mainMember.idOrangTua || mainMember.parentId || "root";

      // Pastikan pId merujuk ke ID anggota Trah untuk header keluarga yang konsisten
      const parentObj = data.find(m => String(m.id) === String(pId));
      if (parentObj && !isTrah(parentObj)) {
        const sId = parentObj.idPasangan || parentObj.spouseId;
        if (sId) pId = sId;
      }

      // Header Keluarga (jika orang tua berubah)
      if (pId !== lastParentId && g !== '0' && g !== 'wafat') {
        if (familyContentHtml) {
          genCardsHtml += `<div class="family-content">${familyContentHtml}</div>`;
          familyContentHtml = '';
        }
        let ortu = data.find(m => String(m.id) === String(pId));
        if (ortu) {
          // Validasi: Jika orang tua yang dirujuk bukan Trah, cari pasangannya yang merupakan Trah
          if (!isTrah(ortu)) {
            const sId = ortu.idPasangan || ortu.spouseId;
            const trahParent = data.find(m => String(m.id) === String(sId) && isTrah(m));
            if (trahParent) ortu = trahParent;
          }
          genCardsHtml += `<div class="family-header ${filterAktif === 'semua' && semuaTerbuka ? '' : 'collapsed'}" onclick="this.classList.toggle('collapsed')"><span>✦✦ Keluarga ${ortu.nama}</span></div>`;
        }
        lastParentId = pId;
      }

      if (partners.length > 0) {
        familyContentHtml += `<div class="a-card-stack" onclick="if(!event.target.closest('.a-aksi')) this.classList.toggle('terbuka')">${stack.map(member => kartu(member, data)).join('')}</div>`;
        stack.forEach(m => renderedIds.add(m.id));
      } else {
        familyContentHtml += kartu(a, data);
        renderedIds.add(a.id);
      }
    });

    if (familyContentHtml) genCardsHtml += `<div class="family-content">${familyContentHtml}</div>`;

    const isInduk = String(g) === '0';
    const lbl = g === 'wafat' ? '🪦 Yang Telah Wafat' : `✦ Generasi ${isInduk ? '0 (Induk)' : g}`;
    htmlOutput += `<div class="gen-section ${filterAktif === 'semua' && semuaTerbuka ? '' : 'collapsed'}">
      <div class="gen-label" onclick="this.parentElement.classList.toggle('collapsed')"><span>${lbl}</span></div>
      <div class="anggota-grid">${genCardsHtml}</div>
    </div>`;
  });

  container.innerHTML = htmlOutput;
};


function kartu(a, allData) {
  const isMale = a.gender === 'L' || a.jenisKelamin === 'L' || a.jenisKelamin === 'Laki-Laki' || a.gender === 'Laki-laki';
  const bday = a.tanggalLahir || a.lahir;
  const ini = a.nama.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  let usiaTeks = '';
  
  if (bday && a.kehidupan !== 'wafat') {
    const lahir = new Date(bday);
    const hariIni = new Date();
    let usia = hariIni.getFullYear() - lahir.getFullYear();
    if (hariIni.getMonth() < lahir.getMonth() || (hariIni.getMonth() === lahir.getMonth() && hariIni.getDate() < lahir.getDate())) usia--;
    usiaTeks = ` (${usia} thn)`;
  }

  const tWafat = a.tglWafat ? new Date(a.tglWafat).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const sudahWafat = a.kehidupan === 'wafat';
  
  // Label Pasangan
  const sId = a.idPasangan || a.spouseId;
  let infoPasangan = '';
  if (sId && allData) {
    const spouse = allData.find(m => String(m.id) === String(sId));
    if (spouse) {
      infoPasangan = `<p class="a-spouse">${isMale ? 'Suami' : 'Istri'} dari ${spouse.panggilan || spouse.nama}</p>`;
    }
  }

  const valUrut = a.urutan || a.urutan_anak;
  const urutanTeks = valUrut ? `<p class="a-urutan">✦ Anak ke-${valUrut}</p>` : '';

  // Badges
  const isTrah = !!(a.idOrangTua || a.parentId || String(a.generasi) === '0');
  const badgeTrah = isTrah ? `<span class="badge trah">Garis Keturunan</span>` : (sId ? `<span class="badge spouse-badge">Anggota Masuk</span>` : '');
  const badgeStatus = sudahWafat ? `<span class="badge wafat-b">🪦 Wafat${tWafat ? ' · ' + tWafat : ''}</span>` : `<span class="badge ${a.status || 'aktif'}">${(a.status || 'aktif') === 'aktif' ? 'Aktif' : 'Tidak Aktif'}</span>`;
  const badgeAkun = a.password ? `<span class="badge aktif" style="background:rgba(201,168,76,0.2); border-color:var(--em); color:var(--em); font-weight:bold;">${a.level?.toUpperCase()}</span>` : '';

  const isOwner = a.createdBy === penggunaLogin.username;
  const canEdit = HAK_AKSES[penggunaLogin.level]?.edit || (penggunaLogin.level === 'anggota' && isOwner);
  const canManage = HAK_AKSES[penggunaLogin.level]?.kelolaAkun;

  return `
    <div class="a-card ${isMale ? 'male' : 'female'} ${sudahWafat ? 'wafat' : ''}">
      <div class="a-top">
        <div class="a-avatar">${a.foto ? `<img src="${a.foto}" alt="${a.nama}" onerror="this.parentElement.innerHTML='${ini}'">` : ini}</div>
        <div>
          <p class="a-nama">${sudahWafat ? '🪦 ' : ''}${a.nama}</p>
          <p class="a-panggilan">${a.panggilan ? '"' + a.panggilan + '"' : ''}</p>
          ${urutanTeks}
          ${infoPasangan}
        </div>
      </div>
      <div class="a-info">
        🎂 ${bday ? new Date(bday).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'} ${usiaTeks}<br>
        ${penggunaLogin.level !== 'guest' ? `
          ${a.hp ? '📱 ' + a.hp + '<br>' : ''}
          ${a.alamat ? '📍 ' + a.alamat : ''}
        ` : '<p style="font-size:0.65rem; color:var(--cb); font-style:italic; margin-top:5px;">* Login untuk lihat detail</p>'}
      </div>
      <div class="a-badges">${badgeStatus}${badgeTrah}${badgeAkun}</div>
      ${canManage ? `
        <div onclick="event.stopPropagation()" style="margin-top:10px; border-top:1px dashed rgba(201,168,76,0.2); padding-top:5px;">
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:5px;">
            <label style="font-size:0.75rem; cursor:pointer;">
              <input type="checkbox" ${a.bolehDaftar ? 'checked' : ''} onchange="window.toggleIzinDaftar('${a.id}', this.checked)"> Izin Akses Login
            </label>
            ${a.bolehDaftar ? `
              <select style="font-size:0.7rem; padding:1px 4px; background:var(--cs); color:var(--kr); border:1px solid var(--em); border-radius:4px; cursor:pointer;" onchange="window.updateLevelAnggota('${a.id}', this.value)">
                <option value="anggota" ${a.level === 'anggota' ? 'selected' : ''}>Anggota</option>
                <option value="pengurus" ${a.level === 'pengurus' ? 'selected' : ''}>Pengurus</option>
                <option value="admin" ${a.level === 'admin' ? 'selected' : ''}>Admin</option>
              </select>
            ` : ''}
          </div>
          ${a.password ? `<p style="font-size:0.65rem; color:var(--em); margin-top:3px;">Pass: ${a.password}</p>` : ''}
        </div>
      ` : ''}
      ${canEdit ? `
        <div class="a-aksi" onclick="event.stopPropagation()">
          <button class="btn-aksi" onclick="window.bukaEdit('${a.id}')">✏ Edit</button>
          ${HAK_AKSES[penggunaLogin.level]?.hapus ? `<button class="btn-aksi hapus" onclick="window.bukaHapus('${a.id}', '${a.nama}')">🗑 Hapus</button>` : ''}
        </div>
      ` : ''}
    </div>`;
}

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
  catatLog(id ? "Edit Transaksi" : "Tambah Transaksi", dsk + " (" + formatRp(jml) + ")");
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
  catatLog("Hapus Transaksi", "ID Transaksi: " + id);
  window.renderBukuBesar();
};

// 6. STATISTIK REALTIME
function startRealtimeStats() {
  let dataAnggotaCached = [];
  onValue(ref(db, "anggota"), (snapshot) => {
    const data = snapshot.exists() ? Object.values(snapshot.val()) : [];
    dataAnggotaCached = data;

    // Pembaruan Stats Utama dengan pengecekan elemen agar tidak crash
    const elTotal = document.getElementById('stat-total');
    const elAktif = document.getElementById('stat-aktif');
    const elWafat = document.getElementById('stat-wafat');
    const elTahun = document.getElementById('stat-tahun-berjalan');

    if (elTotal) elTotal.textContent = data.length;
    if (elAktif) elAktif.textContent = data.filter(a => a.kehidupan !== 'wafat').length;
    if (elWafat) elWafat.textContent = data.filter(a => a.kehidupan === 'wafat').length;
    if (elTahun) elTahun.textContent = new Date().getFullYear() - 1981;

    // Pembaruan Stats per Generasi
    const genEl = document.getElementById('stats-per-gen');
    if (genEl) {
      let html = '';
      const maxGen = data.reduce((max, curr) => {
        const g = parseInt(curr.generasi);
        return isNaN(g) ? max : Math.max(max, g);
      }, 0);

      for (let g = 0; g <= maxGen; g++) { 
        const agg = data.filter(a => parseInt(a.generasi) === g);
        if (agg.length === 0) continue;
        const hidup = agg.filter(a => a.kehidupan !== 'wafat').length;
        const wafat = agg.length - hidup;
        html += `
          <div class="stat-card">
            <p class="stat-lbl">Generasi ${g === 0 ? '0' : g}</p>
            <p class="stat-num" style="font-size:1.8rem">${agg.length}</p>
            <p class="stat-sub">${hidup} hidup ${wafat > 0 ? `· ${wafat} wafat` : ''}</p>
          </div>`;
      }
      genEl.innerHTML = html;
    }
    updateTabunganPribadi(dataAnggotaCached);
    renderAccessCards(dataAnggotaCached);
  });

  onValue(ref(db, "transaksi"), (snapshot) => {
    const trans = snapshot.exists() ? Object.values(snapshot.val()) : [];
    let sIn=0, sOut=0, tIn=0, tOut=0, oIn=0, oOut=0;
    trans.forEach(t => {
        const v = parseInt(t.jumlah) || 0;
        if(t.kategori === 'Sosial') t.tipe === 'masuk' ? sIn+=v : sOut+=v;
        else if(t.kategori === 'Tabungan') t.tipe === 'masuk' ? tIn+=v : tOut+=v;
        else t.tipe === 'masuk' ? oIn+=v : oOut+=v;
    });

    const info = document.getElementById('dash-arisan-info');
    if (info) {
        info.style.display = 'block';
        const elSos = document.getElementById('dash-sosial');
        const elTab = document.getElementById('dash-tabungan');
        if (elSos) elSos.textContent = formatRp(sIn - sOut + oIn - oOut);
        if (elTab) elTab.textContent = formatRp(tIn - tOut);
    }

    if (document.getElementById('panel-buku-besar')?.classList.contains('aktif') && typeof window.renderBukuBesar === 'function') {
      window.renderBukuBesar();
    }
  });

  // Listener Riwayat Arisan untuk Tabungan Pribadi
  onValue(ref(db, "arisan_global"), (snapshot) => {
    window.arisanGlobalData = snapshot.val();
    updateTabunganPribadi(dataAnggotaCached);
  });
}

window.renderLogs = async function() {
  const snap = await get(ref(db, "logs"));
  const logs = snap.exists() ? Object.values(snap.val()) : [];
  logs.sort((a, b) => b.waktu - a.waktu);
  const body = document.getElementById('log-body');
  if (!body) return;
  body.innerHTML = logs.map(l => `
    <tr>
      <td style="white-space:nowrap; font-size:0.65rem; line-height:1.2; padding: 8px 12px 8px 0; vertical-align: top;">
        ${new Date(l.waktu).toLocaleDateString('id-ID', {day:'2-digit', month:'2-digit', year:'2-digit'})}<br>
        <span style="opacity:0.7;">${new Date(l.waktu).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}</span>
      </td>
      <td style="font-size:0.7rem; line-height:1.2; padding: 8px 12px; vertical-align: top;">
        <strong style="color:var(--em);">${l.nama}</strong><br><span style="font-size:0.55rem; opacity:0.7;">${l.level.toUpperCase()}</span>
      </td>
      <td style="padding: 8px 12px; vertical-align: top;"><span class="badge" style="background:var(--cs); color:var(--em); font-size:0.55rem; padding:2px 5px; border-radius:4px;">${l.aksi}</span></td>
      <td style="font-size:0.7rem; line-height:1.3; padding: 8px 0 8px 12px; vertical-align: top; min-width:100px;">${l.detail}</td>
    </tr>
  `).join('');
};

window.hapusSemuaLog = async function() {
  if (penggunaLogin?.level !== 'admin') return toast('Hanya Admin yang dapat menghapus seluruh log.');
  // Dialog konfirmasi dipindahkan ke dalam modal otorisasi itu sendiri.
  
  // Reset input dan buka modal
  document.getElementById('input-password-otorisasi').value = '';
  window.bukaModal('modal-otorisasi');
  setTimeout(() => document.getElementById('input-password-otorisasi').focus(), 100);
};

window.konfirmasiBersihkanLog = async function() {
  const pw = document.getElementById('input-password-otorisasi').value;
  if (pw !== 'bnLm9ufo') {
    toast('Kata sandi salah.');
    return;
  }
  
  window.tutupModal('modal-otorisasi');
  try {
    await remove(ref(db, "logs"));
    toast('Log aktivitas berhasil dibersihkan.');
    // Mencatat log aksi pembersihan itu sendiri
    await catatLog("Bersihkan Log", "Menghapus seluruh riwayat aktivitas sistem");
    window.renderLogs();
  } catch (e) {
    console.error(e);
    toast('Gagal membersihkan log.');
  }
};

function updateTabunganPribadi(members) {
  if (!penggunaLogin || !penggunaLogin.id || !window.arisanGlobalData || !members.length) return;

  const currentMember = members.find(m => String(m.id) === String(penggunaLogin.id));
  if (!currentMember) return;

  // Default tabungan jika tidak diatur khusus adalah 5.000
  const nominalTab = parseInt(currentMember.nominalIuran?.tabungan) || 5000;
  const history = window.arisanGlobalData.iuran_bulanan || [];
  let totalTabunganUser = 0;

  const historyArray = Array.isArray(history) ? history : Object.values(history);
  historyArray.forEach(bulan => {
    const payments = Array.isArray(bulan.pembayaran) ? bulan.pembayaran : Object.values(bulan.pembayaran || {});
    const myPayment = payments.find(p => String(p.memberId) === String(penggunaLogin.id));
    if (myPayment && myPayment.paid) {
      totalTabunganUser += nominalTab;
    }
  });

  const box = document.getElementById('user-tabungan-box');
  const val = document.getElementById('user-tabungan-val');
  if (box && val) {
    box.style.display = 'block';
    val.textContent = formatRp(totalTabunganUser);
  }
}

// 7. HELPER UI
window.bukaPanel = function(nama, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('aktif'));
  document.getElementById('panel-' + nama).classList.add('aktif');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('aktif'));
  if (el) el.classList.add('aktif');
  if (nama === 'anggota') window.renderAnggota();
  if (nama === 'buku-besar') window.renderBukuBesar();
  if (nama === 'logs') window.renderLogs();
  window.tutupSidebar(); // Menutup menu setelah memilih item di mobile
};

window.filterGen = function(gen, el) {
  if (gen === 'semua') {
    // Jika sebelumnya sudah di 'semua', maka toggle status buka/tutup untuk header generasi/keluarga
    if (filterAktif === 'semua') {
      semuaTerbuka = !semuaTerbuka;
    } else {
      semuaTerbuka = true; // Default saat baru masuk ke tab 'Semua', agar langsung terbuka
    }
  } else {
    // Untuk gen1, gen2, dst atau wafat, tidak otomatis buka header generasi/keluarga
    semuaTerbuka = false;
  }

  filterAktif = gen;
  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('aktif'));
  if (el) el.classList.add('aktif');
  window.renderAnggota();
};

window.bukaSidebar = () => {
  document.getElementById('sidebar').classList.add('buka');
  document.getElementById('overlay-sb').classList.add('aktif');
};
window.tutupSidebar = () => {
  document.getElementById('sidebar').classList.remove('buka');
  document.getElementById('overlay-sb').classList.remove('aktif');
};
window.bukaModal = (id) => document.getElementById(id).classList.add('aktif');
window.tutupModal = (id) => document.getElementById(id).classList.remove('aktif');

// Re-check session on load
window.addEventListener('load', () => {
  const saved = sessionStorage.getItem('kromoredjo_user');
  if (saved) {
    const akun = JSON.parse(saved);
    proceedLogin(akun);
    
    // Sinkronisasi Panel berdasarkan hash URL (Contoh: #anggota)
    const hash = window.location.hash.substring(1);
    if (hash) {
      const panelMap = { 'anggota': 'anggota', 'logs': 'logs', 'dashboard': 'dashboard' };
      if (panelMap[hash]) {
        // Cari elemen navigasi terkait untuk memberikan class 'aktif'
        const navItems = document.querySelectorAll('.nav-item');
        let targetNav = null;
        navItems.forEach(item => {
          if (item.getAttribute('onclick')?.includes(`'${panelMap[hash]}'`)) targetNav = item;
        });
        window.bukaPanel(panelMap[hash], targetNav);
      }
    }
  }
});

// Integrasi fungsi modal-anggota yang hilang di app.js baru
window.toggleTglWafat = function() {
  const v = document.getElementById('form-kehidupan').value;
  const g = document.getElementById('group-tgl-wafat');
  const inp = document.getElementById('form-tgl-wafat');
  g.style.opacity = v === 'wafat' ? '1' : '.3';
  inp.disabled = v !== 'wafat';
};

window.bukaFormTambah = function() {
  if (!HAK_AKSES[penggunaLogin.level]?.tambah) return toast("Anda tidak memiliki akses ini.");
  document.getElementById('modal-judul-form').textContent = 'Tambah Anggota Baru';
  resetFormFields();
  window.bukaModal('modal-anggota');
};

function resetFormFields() {
  ['form-id','form-nama','form-panggilan','form-hp','form-lahir','form-alamat','form-tgl-wafat','form-id-orang-tua', 'form-urutan', 'form-foto'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  document.getElementById('form-generasi').value = '4';
  document.getElementById('form-status').value = 'aktif';
  document.getElementById('form-kehidupan').value = 'hidup';
  const radioL = document.querySelector('input[name="form-gender"][value="L"]');
  if(radioL) radioL.checked = true;
  window.toggleTglWafat();
  window.updateFormOptions();
}

window.updateFormOptions = async function(curParentId = "", curSpouseId = "") {
  const data = await window.ambilData();
  const genEl = document.getElementById("form-generasi");
  if(!genEl) return;
  const currentGen = parseInt(genEl.value);
  const currentMemberId = document.getElementById('form-id').value;

  const selectOrangTua = document.getElementById('form-id-orang-tua');
  if(selectOrangTua) {
    let html = '<option value="">- Tanpa Data (Akar) -</option>';
    data.filter(a => {
      const isPrevGen = parseInt(a.generasi) < currentGen;
      const isNotSelf = String(a.id) !== String(currentMemberId);
      const isTrah = !!(a.parentId || a.idOrangTua || String(a.generasi) === '0');
      return isPrevGen && isNotSelf && isTrah;
    }).forEach(p => {
      html += `<option value="${p.id}" ${String(p.id) === String(curParentId) ? 'selected' : ''}>${p.nama} (Gen ${p.generasi})</option>`;
    });
    selectOrangTua.innerHTML = html;
  }

  const selectPasangan = document.getElementById('form-id-pasangan');
  if(selectPasangan) {
    let html = '<option value="">- Tanpa Pasangan -</option>';
    data.filter(a => String(a.generasi) === String(currentGen) && String(a.id) !== String(currentMemberId)).forEach(p => {
      html += `<option value="${p.id}" ${String(p.id) === String(curSpouseId) ? 'selected' : ''}>${p.nama}</option>`;
    });
    selectPasangan.innerHTML = html;
  }
};

window.bukaEdit = async function(id) {
  const data = await window.ambilData();
  const a = data.find(x => String(x.id) === String(id));
  if(!a) return;

  const isOwner = a.createdBy === penggunaLogin.username;
  const canEdit = HAK_AKSES[penggunaLogin.level]?.edit || (penggunaLogin.level === 'anggota' && isOwner);

  if (!canEdit) return toast("Anda tidak memiliki akses ini.");

  document.getElementById('modal-judul-form').textContent = 'Edit Data Anggota';
  document.getElementById('form-id').value = a.id;
  document.getElementById('form-nama').value = a.nama;
  document.getElementById('form-panggilan').value = a.panggilan || '';
  document.getElementById('form-generasi').value = a.generasi;
  document.getElementById('form-urutan').value = a.urutan || '';
  document.getElementById('form-hp').value = a.hp || '';
  document.getElementById('form-lahir').value = a.tanggalLahir || a.lahir || '';
  document.getElementById('form-alamat').value = a.alamat || '';
  document.getElementById('form-foto').value = a.foto || '';
  document.getElementById('form-status').value = a.status || 'aktif';
  document.getElementById('form-kehidupan').value = a.kehidupan || 'hidup';
  document.getElementById('form-tgl-wafat').value = a.tglWafat || '';
  
  const genderRadio = document.querySelector(`input[name="form-gender"][value="${a.gender || 'L'}"]`);
  if(genderRadio) genderRadio.checked = true;

  window.toggleTglWafat();
  await window.updateFormOptions(a.parentId || a.idOrangTua, a.spouseId || a.idPasangan);
  window.bukaModal('modal-anggota');
};

window.bukaHapus = function(id, nama) {
  if (!HAK_AKSES[penggunaLogin.level]?.hapus) return toast("Anda tidak memiliki akses hapus.");
  idHapusPending = id;
  document.getElementById('konfirm-nama').textContent = nama;
  window.bukaModal('modal-hapus');
};

window.konfirmasiHapus = async function() {
  if(!idHapusPending) return;
  await remove(ref(db, "anggota/" + idHapusPending));
  idHapusPending = null;
  window.tutupModal('modal-hapus');
  catatLog("Hapus Anggota", "Menghapus ID: " + idHapusPending);
  window.renderAnggota();
  toast("Anggota berhasil dihapus.");
};

window.simpanAnggota = async function() {
  const rawNama = document.getElementById('form-nama').value.trim();
  // Fungsi standarisasi: Huruf besar di awal kata
  const formatTeks = (str) => str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const nama = formatTeks(rawNama);
  const gen = document.getElementById('form-generasi').value;
  if (!nama) return toast("Nama lengkap wajib diisi.");

  const id = document.getElementById('form-id').value;

  // Cek Duplikasi: Nama dan Generasi yang sama
  const allData = await window.ambilData();
  const isDuplicate = allData.some(a => 
    a.nama.toLowerCase().trim() === nama.toLowerCase() && 
    String(a.generasi) === String(gen) && 
    String(a.id) !== String(id)
  );

  if (isDuplicate) {
    return toast(`Anggota dengan nama "${nama}" di Generasi ${gen} sudah terdaftar.`);
  }

  const kh = document.getElementById('form-kehidupan').value;
  const gender = document.querySelector('input[name="form-gender"]:checked').value;

  // Jika sedang edit, gunakan data yang sudah diambil tadi untuk efisiensi
  const dataLama = id ? allData.find(x => String(x.id) === String(id)) : null;

  const obj = {
    ...dataLama, // Pertahankan data lama (termasuk password, bolehDaftar, dll)
    id: id || 'a_' + Date.now(),
    bolehDaftar: kh === 'wafat' ? false : (dataLama ? (dataLama.bolehDaftar || false) : false),
    password: kh === 'wafat' ? null : (dataLama ? (dataLama.password || null) : null),
    nama,
    panggilan: formatTeks(document.getElementById('form-panggilan').value.trim()),
    generasi: document.getElementById('form-generasi').value,
    parentId: document.getElementById('form-id-orang-tua').value,
    spouseId: document.getElementById('form-id-pasangan').value,
    urutan: document.getElementById('form-urutan').value,
    gender,
    status: kh === 'wafat' ? 'tidak-aktif' : document.getElementById('form-status').value,
    kehidupan: kh,
    tglWafat: kh === 'wafat' ? document.getElementById('form-tgl-wafat').value : '',
    hp: document.getElementById('form-hp').value.trim(),
    tanggalLahir: document.getElementById('form-lahir').value,
    alamat: document.getElementById('form-alamat').value.trim(),
    foto: document.getElementById('form-foto').value.trim(),
    updatedAt: Date.now(),
    createdBy: dataLama ? (dataLama.createdBy || 'admin') : penggunaLogin.username
  };

  await set(ref(db, "anggota/" + obj.id), obj);
  toast(id ? 'Data berhasil diperbarui.' : 'Anggota baru ditambahkan.');
  catatLog(id ? "Edit Anggota" : "Tambah Anggota", nama);
  window.tutupModal('modal-anggota');
  
  // Reset tampilan ke semula setelah simpan
  filterAktif = 'semua';
  semuaTerbuka = false;
  const searchInput = document.getElementById('search-anggota');
  if (searchInput) searchInput.value = '';
  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('aktif'));
  const btnSemua = document.querySelector('.fbtn[onclick*="semua"]');
  if (btnSemua) btnSemua.classList.add('aktif');
  window.renderAnggota();
};