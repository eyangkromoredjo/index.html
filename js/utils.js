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