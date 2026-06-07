export function formatRp(n) {
    return 'Rp ' + (parseInt(n) || 0).toLocaleString('id-ID');
}

export function toast(msg) {
    const t = document.getElementById('toast');
    if (t) {
        t.textContent = msg;
        t.classList.add('tampil');
        setTimeout(() => t.classList.remove('tampil'), 3000);
    } else {
        console.warn("Toast element not found. Message:", msg);
    }
}

export function cleanNumber(s) {
    if (!s) return 0;
    return parseInt(s.toString().replace(/\D/g, '')) || 0;
}

export function applyMask(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
        let val = el.value.replace(/\D/g, '');
        el.value = val ? parseInt(val).toLocaleString('id-ID') : '';
    });
}