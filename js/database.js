// =========================================================================
// 1. INISIALISASI DATABASE LOKAL (KONDISI AWAL MINIMALIS & VALID)
// =========================================================================
function cekDanInisialisasiDatabase() {
    console.log("Memeriksa sinkronisasi database lokal...");

    // JIKA DATA KELUARGA KOSONG, ISI DENGAN INDUK UTAMA (EYANG) SEBAGAI DASAR SILSILAH
    if (!localStorage.getItem("kromoredjo_keluarga")) {
        const mockAnggota = [
            { 
                id: 1, 
                nama: "Eyang Kromoredjo", 
                generasi: 0, 
                status: "Pokok", 
                wafat: true, 
                jenisKelamin: "Laki-Laki",
                tanggalLahir: "", 
                tanggalKematian: "", 
                ikutArisan: false, 
                urutan_anak: 1, 
                tipeArisan: "bukan-peserta", 
                statusArisan: "belum",
                spouseId: null,  // Dipastikan null agar dikenali sebagai jalur keturunan utama
                parentId: null 
            }
        ];
        localStorage.setItem("kromoredjo_keluarga", JSON.stringify(mockAnggota));
        console.log("Database keluarga baru berhasil diinisialisasi.");
    }

    if (!localStorage.getItem("kromoredjo_arisan")) {
        localStorage.setItem("kromoredjo_arisan", JSON.stringify({ peserta: [], riwayat_kocokan: [], iuran_bulanan: [] }));
    }

    if (!localStorage.getItem("kromoredjo_keuangan")) {
        localStorage.setItem("kromoredjo_keuangan", JSON.stringify({ saldo: 0, transaksi: [] }));
    }

    console.log("Sinkronisasi database lokal selesai.");
}

function initToastContainer() {
    if (document.getElementById("toast-container")) return;
    const container = document.createElement("div");
    container.id = "toast-container";
    container.style.position = "fixed";
    container.style.top = "16px";
    container.style.right = "16px";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "10px";
    container.style.zIndex = "9999";
    container.style.pointerEvents = "none";
    document.body.appendChild(container);
}

function showToast(message, type = "success", duration = 1000) {
    if (!document.body) return;
    initToastContainer();
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.backgroundColor = type === "error" ? "#D64545" : type === "warning" ? "#D4A017" : "#3D7F4C";
    toast.style.color = "white";
    toast.style.padding = "12px 16px";
    toast.style.borderRadius = "10px";
    toast.style.boxShadow = "0 10px 24px rgba(0,0,0,0.16)";
    toast.style.fontSize = "0.95rem";
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    toast.style.transition = "opacity .2s ease, transform .2s ease";
    toast.style.pointerEvents = "auto";

    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateX(0)";
    });

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(20px)";
        toast.addEventListener("transitionend", () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        });
    }, duration);
}

// =========================================================================
// 2. HITUNG STATISTIK UTK DASHBOARD (HANYA MENGHITUNG YANG AKTIF/WAFAT)
// =========================================================================
function hitungStatistikPaguyuban() {
    const dataAnggota = JSON.parse(localStorage.getItem("kromoredjo_keluarga")) || [];
    
    let statistik = {
        pokok: 0,
        nonPokok: 0,
        nonAktif: 0,
        wafat: 0,
        generasi: 0 
    };

    const kumpulanGen = new Set();

    dataAnggota.forEach(member => {
        kumpulanGen.add(parseInt(member.generasi));

        if (member.wafat) {
            statistik.wafat++;
        } else {
            if (member.status === "Pokok") statistik.pokok++;
            if (member.status === "Non-Pokok") statistik.nonPokok++;
            if (member.status === "Non-Aktif" || member.status === "Bukan Anggota") statistik.nonAktif++;
        }
    });

    statistik.generasi = dataAnggota.length > 0 ? kumpulanGen.size : 0;
    return statistik;
}

// =========================================================================
// 3. DROPDOWN ORANG TUA DINAMIS (PERBAIKAN SAFETY LOGIC FILTER)
// =========================================================================
function updateDropdownOrangTua(generasiDipilih) {
    const dropdownOrangTua = document.getElementById("input-orangtua"); 
    if (!dropdownOrangTua) return;

    dropdownOrangTua.innerHTML = '<option value="">-- Pilih Orang Tua --</option>';

    const listAnggota = JSON.parse(localStorage.getItem("kromoredjo_keluarga")) || [];
    const generasiTarget = parseInt(generasiDipilih) - 1;

    // PERBAIKAN LOGIKA: Deteksi m.spouseId jauh lebih aman dari string kosong, undefined, atau null
    const orangTuaValid = listAnggota.filter(m => {
        const genCocok = parseInt(m.generasi) === generasiTarget;
        const keturunanAsli = (m.spouseId === null || m.spouseId === undefined || m.spouseId === "" || m.spouseId === 0); 
        return genCocok && keturunanAsli;
    });

    orangTuaValid.forEach(ortu => {
        const option = document.createElement("option");
        option.value = ortu.id;
        option.textContent = ortu.generasi === 0 ? ortu.nama : `${ortu.nama} (Gen ${ortu.generasi})`;
        dropdownOrangTua.appendChild(option);
    });
}

// =========================================================================
// 4. FUNGSI UTILITY
// =========================================================================
function hitungTahunBersama() {
    const tahunBerdiri = 1981;
    const tahunSekarang = new Date().getFullYear();
    return tahunSekarang - tahunBerdiri;
}

function ambilAnggotaTerurut() {
    const listAnggota = JSON.parse(localStorage.getItem("kromoredjo_keluarga")) || [];
    listAnggota.sort((a, b) => {
        const urutanA = a.urutan_anak ? parseInt(a.urutan_anak) : 99;
        const urutanB = b.urutan_anak ? parseInt(b.urutan_anak) : 99;
        return urutanA - urutanB;
    });
    return listAnggota;
}

// =========================================================================
// 5. RENDER TABEL SILSILAH KELUARGA UTAMA (FILTER DATA BUKAN ANGGOTA)
// =========================================================================
function renderSilsilah() {
    const container = document.getElementById("silsilah-container");
    if (!container) return; 

    const keywordInput = document.getElementById("cari-nama");
    const keyword = keywordInput ? keywordInput.value.toLowerCase() : "";
    container.innerHTML = "";

    const listAnggota = JSON.parse(localStorage.getItem("kromoredjo_keluarga")) || [];

    const namaGenerasiJawa = {
        0: "Generasi 0 — Induk Utama (Eyang Segala Trah)",
        1: "Generasi I — Anak & Menantu (Trah Utama)",
        2: "Generasi II — Cucu & Menantu Cucu Trah",
        3: "Generasi III — Cicit & Menantu Cicit Trah",
        4: "Generasi IV — Canggah Trah Keluarga",
        5: "Generasi V — Wareng / Anggota Balita & Bayi",
        6: "Generasi VI — Kelanjar / Cicit Cucu",
        7: "Generasi VII — Ket'urunan Lanjut"
    };

    let adaDataTercetak = false;
    const roleSaatIni = sessionStorage.getItem("pakek_user_role") || 'anggota'; 

    for (let gen = 0; gen <= 7; gen++) {
        // PERBAIKAN: Saring data agar status "Bukan Anggota" tidak masuk ke list tabel manapun
        const semuaAnggotaPerGen = listAnggota.filter(m => parseInt(m.generasi) === gen && m.status !== "Bukan Anggota");
        
        const anakKandung = semuaAnggotaPerGen.filter(m => !m.spouseId).sort((a, b) => {
            const ua = a.urutan_anak ? parseInt(a.urutan_anak) : 9999;
            const ub = b.urutan_anak ? parseInt(b.urutan_anak) : 9999;
            if (ua !== ub) return ua - ub;
            return a.id - b.id;
        });
        const paraPasangan = semuaAnggotaPerGen.filter(m => m.spouseId);

        let anggotaPerGenTerurut = [];
        
        anakKandung.forEach(anak => {
            anggotaPerGenTerurut.push(anak);
            const pasangannya = paraPasangan.find(p => parseInt(p.spouseId) === anak.id);
            if (pasangannya) {
                anggotaPerGenTerurut.push(pasangannya);
            }
        });

        paraPasangan.forEach(p => {
            if (!anggotaPerGenTerurut.some(a => a.id === p.id)) {
                anggotaPerGenTerurut.push(p);
            }
        });

        const anggotaPerGen = anggotaPerGenTerurut.filter(m => m.nama.toLowerCase().includes(keyword));

        if (anggotaPerGen.length > 0) {
            adaDataTercetak = true;
            const genSection = document.createElement("div");
            genSection.className = gen === 0 ? "gen-section induk-trah" : "gen-section";

            let tabelHTML = `
                <div class="gen-title" style="font-weight:bold; margin-top:20px; margin-bottom:10px; color: #4A3419; font-family: 'Lora', serif;">
                    ${namaGenerasiJawa[gen]} (${anggotaPerGen.length} Orang)
                </div>
                <div class="table-responsive" style="overflow-x: auto; background: #FFFDF9; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.02); margin-bottom: 25px;">
                    <table class="table-silsilah" style="width:100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background-color: #F9F6F0; border-bottom: 2px solid #EAE5DC; text-align: left; font-size: 0.85rem; color: #4A3419;">
                                <th style="padding: 12px;">Nama Anggota Keluarga</th>
                                <th style="padding: 12px;">Status Peran</th>
                                <th style="text-align:center; width:150px; padding:12px;">Aksi</th>
                            </tr>
                        </thead>
                        <tbody style="font-size: 0.85rem;">
            `;

            anggotaPerGen.forEach(member => {
                let statusBadge = "";
                let rowClass = "";
                let teksOrangTua = "";
                let teksPasangan = "";

                if (member.parentId) {
                    const parentIdInt = parseInt(member.parentId);
                    const ortuObj = listAnggota.find(a => a.id === parentIdInt);
                    if (ortuObj) {
                        // Tampilkan hanya referensi orang tua tanpa menampilkan nomor urutan
                        teksOrangTua = `<br><span style="color:#777; font-size:0.8em; padding-left: 10px;">↳ Anak dari: <strong>${ortuObj.nama}</strong></span>`;
                    }
                }

                if (member.spouseId) {
                    const pasanganObj = listAnggota.find(a => a.id === parseInt(member.spouseId));
                    if (pasanganObj) {
                        teksPasangan = `<br><span style="color:#C65911; font-size:0.8em; padding-left: 10px;">💞 Pasangan dari: <strong>${pasanganObj.panggilan || pasanganObj.nama}</strong></span>`;
                    }
                }

                if (member.wafat) {
    statusBadge = '<span class="badge-status" style="background:#6c757d; color:white; ...">Rahimahullah</span>';
    rowClass = 'style="color:#aaa; background-color:#F9F9F9; font-style: italic;"';
} else {
    // Label status silsilah (Masih Hidup)
    let labelStatus = "Masih Hidup"; 
    let warna = "#52A447"; 
    
    // Anda bisa tetap menampilkan status peran (Pokok/Non-Pokok) jika mau, 
    // tapi label utama sekarang adalah "Masih Hidup"
    statusBadge = `<span class="badge-status" style="background:${warna}; color:white; padding:3px 8px; border-radius:4px; font-size:0.75rem; font-weight:600;">✓ ${labelStatus}</span>`;
}

                tabelHTML += `
                    <tr ${rowClass} style="border-bottom: 1px solid #EAE5DC;">
                        <td style="padding: 12px; color: #4A4A4A;">
                            <strong style="color: #4A3419;">${member.nama}</strong>
                            ${teksPasangan}
                            ${teksOrangTua}
                        </td>
                        <td style="padding: 12px;">${statusBadge}</td>
                        <td style="text-align:center; padding: 12px;">
                            ${member.parentId ? `<button class="btn-tabel" title="Naikkan urutan" style="margin-right:6px; padding:5px 8px;" onclick="naikkanUrutan(${member.id})">▲</button><button class="btn-tabel" title="Turunkan urutan" style="margin-right:6px; padding:5px 8px;" onclick="turunkanUrutan(${member.id})">▼</button>` : ''}
                            <button class="btn-tabel btn-edit" style="background:#DAC0A3; color:#4A3419; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; font-weight:600; font-size:0.75rem;" onclick="siapEditAnggota(${member.id})">Edit</button>
                            ${roleSaatIni === 'admin' ? `<button class="btn-tabel btn-hapus" style="background:#D44B4B; color:white; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; margin-left:5px; font-weight:600; font-size:0.75rem;" onclick="hapusAnggota(${member.id})">Hapus</button>` : ''}
                        </td>
                    </tr>
                `;
            });

            tabelHTML += `
                        </tbody>
                    </table>
                </div>
            `;
            genSection.innerHTML = tabelHTML;
            container.appendChild(genSection);
        }
    }

    if (!adaDataTercetak) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:#888; background:#FFFDF9; border-radius:8px; border:1px solid #EAE5DC; font-family: 'Lora', serif;">
                ❌ Nama anggota keluarga tidak ditemukan dalam sistem silsilah.
            </div>`;
    }
}
// Tambahkan fungsi ini di dalam database.js
function isiDropdownArisan() {
    const dropdownArisan = document.getElementById("select-anggota-arisan"); // Ganti ID ini sesuai dengan ID di arisan.html Mas Budi
    if (!dropdownArisan) return;

    const listAnggota = JSON.parse(localStorage.getItem("kromoredjo_keluarga")) || [];
    
    // Kita filter hanya anggota yang statusnya bukan "Bukan Anggota" dan tidak wafat
    const anggotaAktif = listAnggota.filter(m => m.status !== "Bukan Anggota" && !m.wafat);

    dropdownArisan.innerHTML = '<option value="">-- Pilih Anggota Keluarga --</option>';
    
    anggotaAktif.forEach(anggota => {
        const option = document.createElement("option");
        option.value = anggota.id;
        option.textContent = anggota.nama;
        dropdownArisan.appendChild(option);
    });
}



// =========================================================================
// 6. FUNGSI EDIT & SIMPAN (PROTEKSI SINKRONISASI TOTAL)
// =========================================================================
function siapEditAnggota(idAnggota) {
    const listAnggota = JSON.parse(localStorage.getItem("kromoredjo_keluarga")) || [];
    const member = listAnggota.find(a => a.id === parseInt(idAnggota));
    
    if (!member) {
        alert("Data anggota tidak ditemukan!");
        return;
    }

    // PERBAIKAN: Gunakan 'member', bukan 'target'
    const inputStatusArisan = document.getElementById("input-status-arisan");
    if (inputStatusArisan) {
        inputStatusArisan.value = member.statusArisan || 'belum'; // Sesuaikan default dengan inisialisasi awal Anda
    }

    console.log("Menyiapkan edit data untuk:", member.nama);
    
    // ... (lanjutan kode Anda yang lain untuk field lainnya)
    const hiddenIdInput = document.getElementById("edit-id-anggota");
    if (hiddenIdInput) hiddenIdInput.value = member.id;
    // ... dst
}

function simpanPerubahanAnggota() {
    const hiddenIdInput = document.getElementById("edit-id-anggota");
    if (!hiddenIdInput || !hiddenIdInput.value) {
        alert("Tidak ada data yang sedang diedit!");
        return;
    }

    const idTarget = parseInt(hiddenIdInput.value);
    let listAnggota = JSON.parse(localStorage.getItem("kromoredjo_keluarga")) || [];
    
    const index = listAnggota.findIndex(a => a.id === idTarget);
    if (index === -1) {
        alert("Gagal memperbarui, data tidak ditemukan!");
        return;
    }

    // 1. Ambil nilai baru dari input
    const namaBaru = document.getElementById("input-nama")?.value || listAnggota[index].nama;
    const genBaru = parseInt(document.getElementById("input-generasi")?.value || listAnggota[index].generasi);
    const parentBaru = document.getElementById("input-orangtua")?.value ? parseInt(document.getElementById("input-orangtua").value) : null;
    const statusArisanBaru = document.getElementById("input-status-arisan")?.value || 'belum'; // Ambil nilai
    
    // 2. Update objek di dalam array
    listAnggota[index].nama = namaBaru;
    listAnggota[index].generasi = genBaru;
    listAnggota[index].parentId = parentBaru;
    listAnggota[index].statusArisan = statusArisanBaru; // Simpan statusArisan
    
    // ... (lanjutkan update field lainnya: status, wafat, tipeArisan, dll)

    // 3. Simpan ke localStorage
    localStorage.setItem("kromoredjo_keluarga", JSON.stringify(listAnggota));
    
    console.log("Data '" + namaBaru + "' Berhasil Di-update!");
    
    // 4. Reset & Render
    hiddenIdInput.value = "";
    renderSilsilah();
    showToast("Perubahan data " + namaBaru + " berhasil disimpan!", "success", 1200);
}

// =========================================================================
// 7. EVENT LISTENER DENGAN PROTEKSI COLD-START (ANTI CRASH)
// =========================================================================
document.addEventListener("DOMContentLoaded", function() {
    cekDanInisialisasiDatabase();
    renderSilsilah();

    const inputGenerasi = document.getElementById("input-generasi"); 
    if (inputGenerasi) {
        inputGenerasi.addEventListener("change", function() {
            updateDropdownOrangTua(this.value);
        });
    }

    // PERBAIKAN TOTAL MASALAH 2: Menggunakan conditional checking (?.) agar tidak crash jika element null
    const inputTipeArisan = document.getElementById("input-tipe-arisan");
    if (inputTipeArisan) {
        const opsiBukanPeserta = inputTipeArisan.querySelector('option[value="bukan-peserta"]');
        if (opsiBukanPeserta) {
            opsiBukanPeserta.remove(); 
            console.log("Opsi 'Bukan Peserta' sukses dibersihkan dari form.");
        }
    }
});

function tambahAnggotaBaru() {
    const elNama = document.getElementById("input-nama");
    const elGen = document.getElementById("input-generasi");
    const elOrtu = document.getElementById("input-orangtua");
    
    // Validasi keberadaan elemen
    if (!elNama || !elGen) {
        console.error("Elemen form input tidak ditemukan di HTML!");
        return;
    }

    const namaBaru = elNama.value;
    const genBaru = parseInt(elGen.value);
    
    if(!namaBaru || isNaN(genBaru)) { 
        alert("Nama dan Generasi wajib diisi dengan benar!"); 
        return; 
    }

    let listAnggota = JSON.parse(localStorage.getItem("kromoredjo_keluarga")) || [];

    const parentIdVal = elOrtu && elOrtu.value ? parseInt(elOrtu.value) : null;

    // Tentukan urutan_anak: jika input manual tersedia gunakan, jika tidak maka gunakan next index pada saudara kandung
    const elUrutan = document.getElementById("urutan_anak");
    let urutanAnak = null;
    if (elUrutan && elUrutan.value) {
        urutanAnak = parseInt(elUrutan.value);
    } else {
        const saudara = listAnggota.filter(m => {
            const pid = (m.parentId === null || m.parentId === undefined || m.parentId === "") ? null : parseInt(m.parentId);
            return pid === parentIdVal && !m.spouseId;
        });
        const maxUrut = saudara.reduce((max, s) => {
            const u = s.urutan_anak ? parseInt(s.urutan_anak) : 0;
            return Math.max(max, u);
        }, 0);
        urutanAnak = maxUrut + 1;
    }

    const anggotaBaru = {
        id: Date.now(), 
        nama: namaBaru,
        generasi: genBaru,
        status: "Pokok",
        wafat: false,
        tipeArisan: "pokok",
        statusArisan: "belum",
        parentId: parentIdVal,
        spouseId: null,
        urutan_anak: urutanAnak
    };

    listAnggota.push(anggotaBaru);
    localStorage.setItem("kromoredjo_keluarga", JSON.stringify(listAnggota));
    
    showToast("Anggota " + namaBaru + " berhasil ditambahkan!", "success", 1200);
    
    // Opsional: Bersihkan form setelah simpan
    elNama.value = "";
    
    renderSilsilah(); 
}

// Naikkan posisi urutan anak (swap dengan saudara sebelumnya)
function naikkanUrutan(id) {
    let listAnggota = JSON.parse(localStorage.getItem("kromoredjo_keluarga")) || [];
    const idx = listAnggota.findIndex(a => a.id === id);
    if (idx === -1) return;
    const member = listAnggota[idx];
    const parentId = (member.parentId === null || member.parentId === undefined || member.parentId === "") ? null : parseInt(member.parentId);

    const saudara = listAnggota
        .filter(m => {
            const pid = (m.parentId === null || m.parentId === undefined || m.parentId === "") ? null : parseInt(m.parentId);
            return pid === parentId && !m.spouseId;
        })
        .sort((a,b) => {
            const ua = a.urutan_anak ? parseInt(a.urutan_anak) : 9999;
            const ub = b.urutan_anak ? parseInt(b.urutan_anak) : 9999;
            if (ua !== ub) return ua - ub;
            return a.id - b.id;
        });

    const pos = saudara.findIndex(s => s.id === id);
    if (pos > 0) {
        const prev = saudara[pos - 1];
        const curUrut = member.urutan_anak ? parseInt(member.urutan_anak) : 0;
        const prevUrut = prev.urutan_anak ? parseInt(prev.urutan_anak) : 0;
        // swap
        listAnggota = listAnggota.map(a => {
            if (a.id === member.id) { a.urutan_anak = prevUrut; }
            else if (a.id === prev.id) { a.urutan_anak = curUrut; }
            return a;
        });
        localStorage.setItem("kromoredjo_keluarga", JSON.stringify(listAnggota));
        renderSilsilah();
    }
}

// Turunkan posisi urutan anak (swap dengan saudara berikutnya)
function turunkanUrutan(id) {
    let listAnggota = JSON.parse(localStorage.getItem("kromoredjo_keluarga")) || [];
    const idx = listAnggota.findIndex(a => a.id === id);
    if (idx === -1) return;
    const member = listAnggota[idx];
    const parentId = (member.parentId === null || member.parentId === undefined || member.parentId === "") ? null : parseInt(member.parentId);

    const saudara = listAnggota
        .filter(m => {
            const pid = (m.parentId === null || m.parentId === undefined || m.parentId === "") ? null : parseInt(m.parentId);
            return pid === parentId && !m.spouseId;
        })
        .sort((a,b) => {
            const ua = a.urutan_anak ? parseInt(a.urutan_anak) : 9999;
            const ub = b.urutan_anak ? parseInt(b.urutan_anak) : 9999;
            if (ua !== ub) return ua - ub;
            return a.id - b.id;
        });

    const pos = saudara.findIndex(s => s.id === id);
    if (pos !== -1 && pos < saudara.length - 1) {
        const next = saudara[pos + 1];
        const curUrut = member.urutan_anak ? parseInt(member.urutan_anak) : 0;
        const nextUrut = next.urutan_anak ? parseInt(next.urutan_anak) : 0;
        // swap
        listAnggota = listAnggota.map(a => {
            if (a.id === member.id) { a.urutan_anak = nextUrut; }
            else if (a.id === next.id) { a.urutan_anak = curUrut; }
            return a;
        });
        localStorage.setItem("kromoredjo_keluarga", JSON.stringify(listAnggota));
        renderSilsilah();
    }
}

// =========================================================================
// 8. SHARED HEADER + UTILITIES (RENDER HEADER CONSISTENT DI SELURUH HALAMAN)
// =========================================================================
function renderAppHeader(selector = '#app-header') {
    const container = (typeof selector === 'string') ? document.querySelector(selector) : selector;
    if (!container) return;

    container.innerHTML = `
        <header class="app-header">
            <div class="app-title-container">
                <img src="../logo PKEK.jpg" alt="Logo PKEK" class="logo-mini">
                <h2 style="font-family: 'Lora', serif; font-weight: 500;">Silsilah & Data Keluarga Besar</h2>
            </div>
            <div class="header-right">
                <span id="user-role-badge" class="badge-user-role">Role</span>
                <button class="btn-kembali-mini" style="background-color: var(--emas-redup); color: #332200; margin-right: 10px; border: none;" onclick="window.location.href='pohon.html'">🌳 Lihat Bagan Pohon</button>
                <button class="btn-kembali-mini" style="color: var(--krem-hangat); border-color: var(--emas-redup);" onclick="kembaliKeDashboard()">← Dashboard</button>
            </div>
        </header>
    `;

    applyHeaderRoleStyling();
}

function applyHeaderRoleStyling() {
    const badge = document.getElementById('user-role-badge');
    if (!badge) return;
    const role = sessionStorage.getItem('pakek_user_role') || 'anggota';
    badge.innerText = role.toUpperCase();
    if (role === 'admin') badge.style.backgroundColor = '#D44B4B';
    else if (role === 'pengurus') badge.style.backgroundColor = '#4B8BD4';
    else badge.style.backgroundColor = '#52A447';
}

function kembaliKeDashboard() {
    window.location.href = "../dashboard.html";
}