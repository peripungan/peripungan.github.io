const columnOrder = [
  "SKU", "Nama", "Harga", "Total",
  "A12 - 1", "A12 - 2", "A12 - 3", "A12 - 4",
  "A19 - 1", "A19 - 2", "A19 - 3",
  "A20 - 1", "A20 - 3", "LTC"
];

const lantaiColumns = columnOrder.slice(4);
let data = [];
let tab = 'all';
let batchSize = 100;
let renderedRows = 0;
let currentSort = { column: null, asc: true };
let autoRefreshInterval = null;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js')
    .then(reg => console.log('✅ Service Worker registered:', reg.scope))
    .catch(err => console.error('⚠️ Service Worker failed:', err));
}

let clusterize = new Clusterize({
  rows: [],
  scrollId: 'scrollArea',
  contentId: 'contentArea',
  no_data_text: 'Tidak ada data',
});

function changeTheme(theme) {
  document.body.className = theme;
  localStorage.setItem("selectedTheme", theme);
}

function loadSavedTheme() {
  const saved = localStorage.getItem("selectedTheme");
  if (saved) {
    document.body.className = saved;
    const selector = document.getElementById("themeSelector");
    if (selector) selector.value = saved;
  }
}

function formatCurrency(num) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0
  }).format(num);
}

// function setTab(value) {
//   tab = value;
//   document.getElementById("tabAll").classList.remove("active");
//   document.getElementById("tabMinus").classList.remove("active");
//   document.getElementById("tab" + capitalize(value)).classList.add("active");
//   renderedRows = 0;
//   document.querySelector("#data-table tbody").innerHTML = '';
//   renderTable();
// }

function onStockToggle() {
  const isMinus = document.getElementById("stockToggle").checked;
  tab = isMinus ? 'minus' : 'all';
  renderedRows = 0;
  clusterize.clear();

  renderTable();
  showToast(isMinus ? "❌ Menampilkan Stok Minus" : "📦 Menampilkan Semua Data");
}


function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getSelectedFloors() {
  let saved = JSON.parse(localStorage.getItem("selectedFloors") || JSON.stringify(lantaiColumns));
  return saved;
}

function saveSelectedFloors(selected) {
  localStorage.setItem("selectedFloors", JSON.stringify(selected));
  renderedRows = 0;
  document.querySelector("#data-table tbody").innerHTML = '';
  renderTable();
}

function setupLantaiCheckboxes() {
  const container = document.getElementById("lantaiFilter");
  container.innerHTML = '';
  lantaiColumns.forEach(col => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = col;
    const selectedFloors = getSelectedFloors();

    checkbox.checked = selectedFloors.includes(col);
    checkbox.onchange = () => {
      const selected = Array.from(document.querySelectorAll("#lantaiFilter input:checked"))
                            .map(cb => cb.value);
      saveSelectedFloors(selected);
    };
    label.appendChild(checkbox);
    label.append(" ", col);
    container.appendChild(label);
  });
}

function selectAllFloors() {
  const checkboxes = document.querySelectorAll("#lantaiFilter input[type='checkbox']");
  checkboxes.forEach(cb => cb.checked = true);
  const selected = Array.from(checkboxes).map(cb => cb.value);
  saveSelectedFloors(selected);
}

function clearAllFloors() {
  const checkboxes = document.querySelectorAll("#lantaiFilter input[type='checkbox']");
  checkboxes.forEach(cb => cb.checked = false);
  saveSelectedFloors([]);
}


function initResize(index) {
  return function (e) {
    const th = document.querySelectorAll("th")[index];
    const startX = e.pageX;
    const startWidth = th.offsetWidth;

    function onMouseMove(e) {
      const newWidth = startWidth + (e.pageX - startX);
      th.style.width = newWidth + "px";
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };
}

function renderTable() {
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const selectedFloors = getSelectedFloors();
  const dynamicColumns = ["SKU", "Nama", "Harga", "Total", ...selectedFloors];
  
  // Clear and re-render header
  const thead = document.querySelector("#data-table thead");
  thead.innerHTML = '';
  const headerRow = document.createElement('tr');

  dynamicColumns.forEach((col, index) => {
    const th = document.createElement('th');
    th.textContent = col;
    th.onclick = () => sortTable(col);

    if (currentSort.column === col) {
      th.classList.add(currentSort.asc ? "sort-asc" : "sort-desc");
    }

    // Add resizer
    const resizer = document.createElement('div');
    resizer.classList.add('resizer');
    resizer.addEventListener('mousedown', initResize(index));
    th.appendChild(resizer);
    
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  // Filter data by tab and search
  let filtered = data.filter(row => {
    const keyword = `${row["SKU"] ?? ''} ${row["Nama"] ?? ''}`.toLowerCase();
    const tokens = search.split(/\s+/);
    const searchMatch = tokens.every(token => keyword.includes(token));
    const minusMatch = tab !== 'minus' || selectedFloors.some(c => Number(row[c]) < 0) || Number(row["Total"]) < 0;

    return searchMatch && minusMatch;
  });

  // Slice + convert to HTML
  const slice = filtered.slice(0, renderedRows + batchSize);
  const rowsHTML = buildTableRows(slice, dynamicColumns);

  clusterize.update(rowsHTML);
  renderedRows += batchSize;
}

function sortTable(column) {
  currentSort.asc = currentSort.column === column ? !currentSort.asc : true;
  currentSort.column = column;

  // Clear old sort indicators
  document.querySelectorAll("#data-table thead th").forEach(th => {
    th.classList.remove("sort-asc", "sort-desc");
  });

  // Add indicator to sorted column
  const ths = document.querySelectorAll("#data-table thead th");
  ths.forEach(th => {
    if (th.textContent.trim() === column) {
      th.classList.add(currentSort.asc ? "sort-asc" : "sort-desc");
    }
  });

  data = [...data].sort((a, b) => {
    let valA = a[column] ?? '';
    let valB = b[column] ?? '';
    return currentSort.asc
      ? compareValues(valA, valB)
      : compareValues(valB, valA);
  });

  renderedRows = 0;
  clusterize.clear();       // <---- ini penting agar rows direset
  renderTable();            // lalu render ulang dengan urutan baru
}

function refreshTable() {
  renderedRows = 0;
  document.querySelector("#data-table tbody").innerHTML = '';
  renderTable();
}

const debouncedRefreshTable = debounce(refreshTable, 250);

function onSearchInput() {
  const input = document.getElementById("searchInput");
  const clearBtn = document.querySelector(".clear-button");
  if (input.value.trim() !== "") {
    clearBtn.classList.add("show");
  } else {
    clearBtn.classList.remove("show");
  }
  debouncedRefreshTable();
}

function clearSearch() {
  const input = document.getElementById("searchInput");
  input.value = "";
  onSearchInput(); // hide button
}

async function fetchData() {
  document.getElementById("spinner").style.display = "inline-block";

  const res = await fetch("https://pusatpneumatic.com/pernataan/scripts/stok-dev.json");
  const rawData = await res.json();

  data = (rawData || []).map(item => {
    const row = {
      SKU: item.s,
      Nama: item.n,
      Harga: item.p,
      Total: item.t
    };
    item.k.forEach(loc => {
      row[loc.l] = loc.q;
    });
    return row;
  });

  setupLantaiCheckboxes();
  renderedRows = 0;
  clusterize.clear();  // Penting: reset clusterize internal state
  renderTable();
  document.getElementById("lastUpdated").textContent = new Date().toLocaleTimeString('id-ID');
  document.getElementById("spinner").style.display = "none";
}

function buildTableRows(rows, dynamicColumns) {
  return rows.map(row => {
    let tr = "<tr>";
    dynamicColumns.forEach(col => {
      let value = row[col];
      let classes = "";
      let attrs = "";

      if (value === undefined || value === "") {
        value = "-";
      } else if (col === "Harga") {
        const raw = Number(value);
        value = formatCurrency(raw);
        classes = "harga";
        attrs = `data-raw="${raw}"`;
      }

      if (["SKU", "Nama"].includes(col)) {
        classes += "left-align";
      } else if (!isNaN(value)) {
        classes += "right-align";
      }

      tr += `<td class="${classes.trim()}" ${attrs}>${value}</td>`;
    });
    tr += "</tr>";
    return tr;
  });
}

function toggleAutoRefresh() {
  const toggle = document.getElementById('autoRefreshToggle');
  const isEnabled = toggle.checked;

  if (isEnabled) {
    showToast("🔄 Auto Update AKTIF");
    autoRefreshInterval = setInterval(() => {
      console.log("Auto refreshing...");
      fetchData(); // Ganti ini dengan fungsi fetch datamu
    }, 60000); // 1 menit
  } else {
    showToast("⏸️ Auto Update NONAKTIF");
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.left = "50%";
  toast.style.transform = "translateX(-50%)";
  toast.style.background = "#333";
  toast.style.color = "#fff";
  toast.style.padding = "8px 16px";
  toast.style.borderRadius = "20px";
  toast.style.fontSize = "0.85rem";
  toast.style.zIndex = "1000";
  toast.style.opacity = "0";
  toast.style.transition = "opacity 0.3s";

  document.body.appendChild(toast);
  setTimeout(() => toast.style.opacity = "1", 10);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Jalankan awal
window.addEventListener("DOMContentLoaded", () => {
  toggleAutoRefresh();
});

function compareValues(a, b) {
  const numA = parseFloat(a);
  const numB = parseFloat(b);

  if (!isNaN(numA) && !isNaN(numB)) {
    return numA - numB;
  }

  return String(a).localeCompare(String(b), 'id', { numeric: true });
}

document.getElementById("scrollArea").addEventListener("scroll", () => {
  const wrapper = document.getElementById("scrollArea");
  if (wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 10) {
    renderTable();
  }
});

document.getElementById("toggleFilterBtn").addEventListener("click", function () {
  const wrapper = document.querySelector(".filter-wrapper");
  const button = document.getElementById("toggleFilterBtn");
  const isOpen = wrapper.classList.toggle("show");

  button.textContent = (isOpen ? "🔼" : "🔽") + " Filter";
});

document.addEventListener("mouseover", (e) => {
  if (e.target.matches("td.harga")) {
    const td = e.target;
    const raw = parseFloat(td.dataset.raw);
    if (!isNaN(raw)) {
      td.dataset.original = td.textContent;
      td.textContent = formatCurrency(raw * 1.11);
    }
  }
});

document.addEventListener("mouseout", (e) => {
  const td = e.target;
  if (e.target.matches("td.harga") && td.dataset.original) {
    td.textContent = td.dataset.original;
    delete td.dataset.original;
  }
});

document.getElementById("lastUpdated").addEventListener("click", function () {
  const audio = document.getElementById("hidup-jokowi");
  audio.currentTime = 0;
  audio.play();
});

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("stockToggle").checked = (tab === "minus");
  const scrollArea = document.getElementById("scrollArea");
  const rocket = document.getElementById("rocketmeluncur");
  let isLaunched = false;

  // Scroll listener
  scrollArea.addEventListener("scroll", () => {
    if (isLaunched) return; // Jangan munculkan ulang jika sedang launch

    if (scrollArea.scrollTop > 200) {
      rocket.classList.add("showrocket");
    } else {
      rocket.classList.remove("showrocket");
    }
  });

  // Click to scroll to top
  rocket.addEventListener("click", () => {
    rocket.classList.add("launchrocket");
    
    const audio = document.getElementById("roket-audio");
    audio.currentTime = 0;
    audio.play();
    isLaunched = true;

    // Scroll to top
    scrollArea.scrollTo({
      top: 0,
      behavior: "smooth"
    });

    // Reset class after animation
    setTimeout(() => {
      rocket.classList.remove("launchrocket");
      rocket.classList.remove("showrocket");
      isLaunched = false;
    }, 800); // harus sesuai dengan durasi transform CSS
  });
});

loadSavedTheme();
fetchData();