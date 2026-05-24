const currency = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
});

const SESSION_KEY = 'shopSession';
const CART_KEY = 'shopCart';

let products = [];
let cart = loadJson(CART_KEY, []).map(normalizeCartItem).filter(Boolean);
let currentUser = normalizeSession(loadJson(SESSION_KEY, null));

const cartCount = document.getElementById('cartCount');
const cartItems = document.getElementById('cartItems');
const subtotal = document.getElementById('subtotal');
const checkoutMessage = document.getElementById('checkoutMessage');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const productGrid = document.getElementById('productGrid');
const secondaryProducts = document.querySelector('.secondary-products');
const accountButton = document.getElementById('accountButton');
const openAuthButton = document.getElementById('openAuthButton');
const logoutButton = document.getElementById('logoutButton');
const accountStatus = document.getElementById('accountStatus');
const profileForm = document.getElementById('profileForm');
const profileFullName = document.getElementById('profileFullName');
const profilePhone = document.getElementById('profilePhone');
const profileAddress = document.getElementById('profileAddress');
const profileMessage = document.getElementById('profileMessage');
const orderHistoryPanel = document.getElementById('orderHistoryPanel');
const orderHistoryList = document.getElementById('orderHistoryList');
const orderHistoryMessage = document.getElementById('orderHistoryMessage');
const refreshOrdersButton = document.getElementById('refreshOrdersButton');
const adminPanel = document.getElementById('adminPanel');
const adminProductForm = document.getElementById('adminProductForm');
const adminProductsBody = document.getElementById('adminProductsBody');
const adminMessage = document.getElementById('adminMessage');
const adminOrdersBody = document.getElementById('adminOrdersBody');
const adminOrdersMessage = document.getElementById('adminOrdersMessage');
const refreshAdminOrdersButton = document.getElementById('refreshAdminOrdersButton');

init();

async function init() {
    products = extractProductsFromDom();
    bindStaticEvents();
    await restoreSession();
    await loadProducts();
    syncCartWithProducts();
    renderProducts();
    renderProductDetail();
    renderCart();
    renderSearch(searchInput.value);
    updateAccountUi();
    renderAdminProducts();
}

function bindStaticEvents() {
    document.addEventListener('click', handleDocumentClick);

    searchInput.addEventListener('input', () => {
        renderSearch(searchInput.value);
    });

    document.getElementById('searchModal').addEventListener('shown.bs.modal', () => {
        searchInput.focus();
        renderSearch(searchInput.value);
    });

    document.getElementById('momoCheckout').addEventListener('click', () => {
        startPayment('momo');
    });

    document.getElementById('zaloCheckout').addEventListener('click', () => {
        startPayment('zalopay');
    });

    document.getElementById('codCheckout').addEventListener('click', () => {
        startCodCheckout();
    });

    document.getElementById('loginForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        await submitAuth('/login', {
            username: document.getElementById('loginUsername').value,
            password: document.getElementById('loginPassword').value
        }, document.getElementById('loginMessage'));
    });

    document.getElementById('registerForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        await submitAuth('/register', {
            username: document.getElementById('registerUsername').value,
            password: document.getElementById('registerPassword').value
        }, document.getElementById('registerMessage'));
    });

    openAuthButton.addEventListener('click', showAuthModal);

    accountButton.addEventListener('click', (event) => {
        if (!currentUser?.token) {
            event.preventDefault();
            showAuthModal();
        }
    });

    logoutButton.addEventListener('click', async () => {
        await logout();
    });

    profileForm.addEventListener('submit', submitProfile);

    refreshOrdersButton.addEventListener('click', () => {
        loadOrderHistory();
    });

    refreshAdminOrdersButton.addEventListener('click', () => {
        loadAdminOrders();
    });

    adminProductForm.addEventListener('submit', submitAdminProduct);

    document.getElementById('cancelAdminEdit').addEventListener('click', () => {
        resetAdminForm();
    });
}

async function restoreSession() {
    if (!currentUser?.token) {
        clearSession();
        return;
    }

    try {
        const response = await fetch('/api/auth/me', {
            headers: authHeaders(false)
        });
        const data = await response.json();

        if (!response.ok || !data.user) {
            clearSession();
            return;
        }

        currentUser = {
            id: data.user.id || null,
            username: data.user.username,
            role: data.user.role,
            fullName: data.user.fullName || '',
            phone: data.user.phone || '',
            address: data.user.address || '',
            token: currentUser.token,
            expiresAt: currentUser.expiresAt || null
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
    } catch {
        clearSession();
    }
}

async function logout() {
    if (currentUser?.token) {
        try {
            await fetch('/logout', {
                method: 'POST',
                headers: authHeaders(false)
            });
        } catch {
            // Local logout still happens if the network request fails.
        }
    }

    clearSession();
    updateAccountUi();
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    currentUser = null;
}

function handleDocumentClick(event) {
    const filterButton = event.target.closest('[data-filter]');
    if (filterButton) {
        applyCategoryFilter(filterButton);
        return;
    }

    const wishlistButton = event.target.closest('.wishlist-btn');
    if (wishlistButton) {
        wishlistButton.classList.toggle('active');
        wishlistButton.innerHTML = wishlistButton.classList.contains('active')
            ? '<i class="bi bi-heart-fill"></i>'
            : '<i class="bi bi-heart"></i>';
        return;
    }

    const addButton = event.target.closest('.add-to-cart, .add-detail-cart');
    if (addButton) {
        addProductFromButton(addButton);
        return;
    }

    const sizeButton = event.target.closest('.size-list button');
    if (sizeButton) {
        document.querySelectorAll('.size-list button').forEach((button) => {
            button.classList.remove('selected');
        });
        sizeButton.classList.add('selected');
        return;
    }

    const qtyButton = event.target.closest('[data-qty]');
    if (qtyButton) {
        changeCartQty(Number(qtyButton.dataset.qty), Number(qtyButton.dataset.change));
        return;
    }

    const searchButton = event.target.closest('.search-result');
    if (searchButton) {
        scrollToProduct(searchButton.dataset.productId);
        return;
    }

    const editButton = event.target.closest('[data-admin-edit]');
    if (editButton) {
        fillAdminForm(Number(editButton.dataset.adminEdit));
        return;
    }

    const deleteButton = event.target.closest('[data-admin-delete]');
    if (deleteButton) {
        deleteAdminProduct(Number(deleteButton.dataset.adminDelete));
    }
}

async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        const data = await response.json();

        if (response.ok && Array.isArray(data.products)) {
            products = data.products;
        }
    } catch {
        products = products.length ? products : extractProductsFromDom();
    }
}

function syncCartWithProducts() {
    cart = cart.map((item) => {
        const product = products.find((entry) => Number(entry.id) === Number(item.productId));
        if (!product) return null;

        const size = item.size ? String(item.size) : '';
        if (requiresSize(product)) {
            const sizes = getProductSizes(product);
            const stock = Number(product.stock?.[size] || 0);

            if (!size || !sizes.includes(size) || stock <= 0) {
                return null;
            }

            return {
                productId: Number(product.id),
                name: product.name,
                size,
                quantity: Math.min(Number(item.quantity) || 1, stock),
                price: Number(product.price) || 0
            };
        }

        return {
            productId: Number(product.id),
            name: product.name,
            size: null,
            quantity: Math.max(1, Number(item.quantity) || 1),
            price: Number(product.price) || 0
        };
    }).filter(Boolean);

    saveCart();
}

function renderProducts() {
    if (!products.length) return;

    if (productGrid) {
        productGrid.classList.add('row', 'g-4');
        productGrid.innerHTML = products
            .filter((product) => product.section === 'new')
            .map((product) => renderProductCard(product, true))
            .join('');
    }

    if (secondaryProducts) {
        secondaryProducts.classList.add('row', 'g-4');
        secondaryProducts.innerHTML = products
            .filter((product) => product.section !== 'new')
            .map((product) => renderProductCard(product, false))
            .join('');
    }

    applyActiveFilter();
}

function renderProductCard(product, showWishlist) {
    const sizes = getProductSizes(product);
    const sizeSelect = sizes.length ? `
        <select class="product-size-select" data-size-for="${product.id}" aria-label="Chọn size ${escapeAttr(product.name)}">
            <option value="">Chọn size</option>
            ${sizes.map((size) => {
        const qty = Number(product.stock?.[String(size)] || 0);
        const disabled = qty <= 0 ? ' disabled' : '';
        const label = qty <= 0 ? `${size} - hết hàng` : `${size} (${qty})`;
        return `<option value="${escapeAttr(size)}"${disabled}>${escapeHtml(label)}</option>`;
    }).join('')}
        </select>
    ` : '';

    return `
        <article class="product-card-shell col-12 col-sm-6 col-lg-4 col-xl-3" data-product-id="${product.id}"
            data-name="${escapeAttr(product.name)}" data-category="${escapeAttr(product.displayCategory)}"
            data-type="${escapeAttr(product.category)}" data-price="${Number(product.price) || 0}">
            <div class="product-card card h-full border-0 shadow-sm rounded-xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
                ${showWishlist ? '<button class="wishlist-btn shadow-sm transition-all duration-300 hover:scale-105" type="button" aria-label="Yêu thích"><i class="bi bi-heart"></i></button>' : ''}
                <a class="product-media block overflow-hidden bg-gray-100" href="#product-detail">
                    <img class="w-full object-cover transition-transform duration-300" src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}" loading="lazy">
                </a>
                <div class="product-info p-4">
                    <span class="text-xs font-extrabold uppercase text-rose-600">${escapeHtml(product.displayCategory)}</span>
                    <h3 class="text-base font-extrabold leading-snug">${escapeHtml(product.name)}</h3>
                    ${sizeSelect}
                    <div class="product-bottom">
                        <strong>${currency.format(Number(product.price) || 0)}</strong>
                        <button class="add-to-cart rounded-lg bg-neutral-950 px-4 py-2 text-xs font-extrabold uppercase text-white transition-all duration-300 hover:scale-105 hover:bg-rose-700" type="button" data-product-id="${product.id}">Thêm</button>
                    </div>
                </div>
            </div>
        </article>
    `;
}

function renderProductDetail() {
    const product = products.find((item) => item.id === 1) || products[0];
    if (!product) return;

    const detailCard = document.querySelector('.detail-card');
    const detailButton = document.querySelector('.add-detail-cart');
    const sizeList = document.querySelector('.detail-card .size-list');
    const title = document.querySelector('.detail-card h2');
    const price = document.querySelector('.detail-price');

    if (title) title.textContent = product.name;
    if (price) price.textContent = currency.format(Number(product.price) || 0);

    if (detailCard) {
        detailCard.dataset.productId = product.id;
        detailCard.dataset.name = product.name;
        detailCard.dataset.price = product.price;
    }

    if (detailButton) {
        detailButton.dataset.productId = product.id;
        detailButton.dataset.name = product.name;
        detailButton.dataset.price = product.price;
    }

    if (sizeList) {
        const sizes = getProductSizes(product);
        const firstAvailableIndex = sizes.findIndex((size) => {
            return Number(product.stock?.[String(size)] || 0) > 0;
        });
        sizeList.innerHTML = sizes.map((size, index) => {
            const disabled = Number(product.stock?.[String(size)] || 0) <= 0 ? ' disabled' : '';
            const selected = index === firstAvailableIndex ? ' class="selected"' : '';
            return `<button type="button" data-size="${escapeAttr(size)}"${selected}${disabled}>${escapeHtml(size)}</button>`;
        }).join('');
    }
}

function applyCategoryFilter(button) {
    document.querySelectorAll('[data-filter]').forEach((item) => {
        item.classList.remove('active');
    });

    button.classList.add('active');
    applyActiveFilter();
}

function applyActiveFilter() {
    const active = document.querySelector('[data-filter].active');
    const filter = active ? active.dataset.filter : 'all';

    document.querySelectorAll('.secondary-products .product-card-shell, .secondary-products > .product-card').forEach((card) => {
        card.hidden = filter !== 'all' && card.dataset.category !== filter;
    });
}

function addProductFromButton(button) {
    const productContainer = button.closest('.product-card-shell') || button.closest('.product-card') || button.closest('.detail-card');
    const productId = Number(button.dataset.productId || productContainer?.dataset.productId || 0);
    const product = products.find((item) => item.id === productId) || productFromCard(productContainer, button);

    if (!product) return;

    let size = '';
    if (requiresSize(product)) {
        if (button.classList.contains('add-detail-cart')) {
            size = document.querySelector('.detail-card .size-list button.selected')?.dataset.size || '';
        } else {
            size = productContainer?.querySelector('.product-size-select')?.value || '';
        }

        if (!size) {
            alert('Vui lòng chọn size');
            return;
        }

        if (Number(product.stock?.[String(size)] || 0) <= 0) {
            alert('Size này tạm hết hàng');
            return;
        }
    }

    addToCart(product, size);
}

function addToCart(product, size) {
    const productId = Number(product.id);
    const normalizedSize = size ? String(size) : '';
    const item = cart.find((entry) => {
        return Number(entry.productId) === productId && String(entry.size || '') === normalizedSize;
    });

    if (!canAddQuantity(product, normalizedSize, item ? item.quantity : 0)) {
        alert('Số lượng vượt quá tồn kho');
        return;
    }

    if (item) {
        item.quantity += 1;
    } else {
        cart.push({
            productId,
            name: product.name,
            size: normalizedSize || null,
            quantity: 1,
            price: Number(product.price) || 0
        });
    }

    saveCart();
    renderCart();
}

function changeCartQty(index, change) {
    const item = cart[index];
    if (!item) return;

    const product = products.find((entry) => Number(entry.id) === Number(item.productId));

    if (change > 0 && product && !canAddQuantity(product, item.size || '', item.quantity)) {
        alert('Số lượng vượt quá tồn kho');
        return;
    }

    item.quantity += change;

    if (item.quantity <= 0) {
        cart.splice(index, 1);
    }

    saveCart();
    renderCart();
}

function renderCart() {
    const totalQty = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const total = cart.reduce((sum, item) => {
        return sum + Number(item.price || 0) * Number(item.quantity || 0);
    }, 0);

    cartCount.textContent = totalQty;
    subtotal.textContent = currency.format(total);
    checkoutMessage.textContent = '';

    if (!cart.length) {
        cartItems.innerHTML = '<p class="empty-cart">Chưa có sản phẩm trong giỏ.</p>';
        return;
    }

    cartItems.innerHTML = cart.map((item, index) => `
        <div class="cart-line">
            <div>
                <strong>${escapeHtml(item.name)}</strong>
                ${item.size ? `<small>Size: ${escapeHtml(item.size)}</small>` : ''}
                <span>${currency.format(Number(item.price) || 0)}</span>
            </div>
            <div class="qty-controls">
                <button type="button" data-qty="${index}" data-change="-1" aria-label="Giảm số lượng">-</button>
                <span>${Number(item.quantity) || 0}</span>
                <button type="button" data-qty="${index}" data-change="1" aria-label="Tăng số lượng">+</button>
            </div>
        </div>
    `).join('');
}

function renderSearch(query) {
    const normalized = query.trim().toLowerCase();
    const matches = products.filter((product) => {
        const haystack = `${product.name} ${product.displayCategory}`.toLowerCase();
        return !normalized || haystack.includes(normalized);
    }).slice(0, 6);

    searchResults.innerHTML = matches.map((product) => `
        <button type="button" class="search-result" data-product-id="${product.id}">
            <span>${escapeHtml(product.name)}</span>
            <strong>${currency.format(Number(product.price) || 0)}</strong>
        </button>
    `).join('');
}

function scrollToProduct(productId) {
    const card = document.querySelector(`[data-product-id="${CSS.escape(String(productId))}"]`);
    const modal = bootstrap.Modal.getInstance(document.getElementById('searchModal'));
    if (modal) modal.hide();

    if (card) {
        card.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }
}

async function startPayment(provider) {
    const amount = cart.reduce((sum, item) => {
        return sum + Number(item.price || 0) * Number(item.quantity || 0);
    }, 0);

    if (!amount) {
        checkoutMessage.textContent = 'Vui lòng thêm sản phẩm trước khi thanh toán.';
        return;
    }

    checkoutMessage.textContent = 'Đang tạo phiên thanh toán...';

    try {
        const response = await fetch(`/api/payments/${provider}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                orderInfo: 'Thanh toán đơn hàng Chill n Free',
                description: 'Thanh toán đơn hàng Chill n Free',
                items: getCheckoutItems()
            })
        });

        const data = await response.json();

        if (data.paymentUrl) {
            window.location.href = data.paymentUrl;
            return;
        }

        checkoutMessage.textContent = data.message || 'Chưa tạo được liên kết thanh toán.';
    } catch {
        checkoutMessage.textContent = 'Không kết nối được cổng thanh toán.';
    }
}

async function startCodCheckout() {
    const amount = cart.reduce((sum, item) => {
        return sum + Number(item.price || 0) * Number(item.quantity || 0);
    }, 0);

    if (!amount) {
        checkoutMessage.textContent = 'Vui lòng thêm sản phẩm trước khi đặt COD.';
        return;
    }

    if (!currentUser?.token) {
        checkoutMessage.textContent = 'Vui lòng đăng nhập trước khi đặt COD.';
        showAuthModal();
        return;
    }

    if (!hasCompleteProfile(currentUser)) {
        checkoutMessage.textContent = 'Vui lòng cập nhật tên, số điện thoại và địa chỉ ở tài khoản.';
        location.hash = 'account';
        profileFullName.focus();
        return;
    }

    checkoutMessage.textContent = 'Đang tạo đơn COD...';

    try {
        const response = await fetch('/api/payments/cod', {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({
                description: 'Thanh toán khi nhận hàng',
                items: getCheckoutItems()
            })
        });
        const data = await response.json();

        if (!response.ok) {
            checkoutMessage.textContent = data.message || 'Không tạo được đơn COD.';
            return;
        }

        cart = [];
        saveCart();
        renderCart();
        await loadProducts();
        syncCartWithProducts();
        renderProducts();
        renderProductDetail();
        renderSearch(searchInput.value);
        await loadOrderHistory();
        if (currentUser.role === 'Admin') {
            await loadAdminOrders();
        }
        checkoutMessage.textContent = `Đã tạo đơn COD ${data.orderId}.`;
    } catch {
        checkoutMessage.textContent = 'Không kết nối được server.';
    }
}

function getCheckoutItems() {
    return cart.map((item) => {
        return {
            productId: item.productId,
            size: item.size,
            quantity: item.quantity
        };
    });
}

async function submitAuth(url, payload, messageElement) {
    messageElement.textContent = 'Đang xử lý...';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (!response.ok) {
            messageElement.textContent = data.message || 'Không xử lý được yêu cầu.';
            return;
        }

        if (!data.token) {
            messageElement.textContent = 'Phien dang nhap khong hop le.';
            return;
        }

        currentUser = {
            id: data.id || null,
            username: data.username,
            role: data.role,
            fullName: data.fullName || '',
            phone: data.phone || '',
            address: data.address || '',
            token: data.token,
            expiresAt: data.expiresAt || null
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
        messageElement.textContent = 'Đăng nhập thành công.';
        updateAccountUi();

        const modal = bootstrap.Modal.getInstance(document.getElementById('authModal'));
        if (modal) modal.hide();
    } catch {
        messageElement.textContent = 'Không kết nối được server.';
    }
}

function showAuthModal() {
    bootstrap.Modal.getOrCreateInstance(document.getElementById('authModal')).show();
}

function updateAccountUi() {
    if (!currentUser?.token) {
        accountStatus.textContent = 'Chưa đăng nhập';
        openAuthButton.hidden = false;
        logoutButton.hidden = true;
        profileForm.hidden = true;
        profileMessage.textContent = '';
        orderHistoryPanel.hidden = true;
        orderHistoryList.innerHTML = '';
        orderHistoryMessage.textContent = '';
        adminOrdersBody.innerHTML = '';
        adminOrdersMessage.textContent = '';
        adminPanel.hidden = true;
        return;
    }

    accountStatus.textContent = `${currentUser.username} - ${currentUser.role}`;
    openAuthButton.hidden = true;
    logoutButton.hidden = false;
    profileForm.hidden = false;
    profileFullName.value = currentUser.fullName || '';
    profilePhone.value = currentUser.phone || '';
    profileAddress.value = currentUser.address || '';
    orderHistoryPanel.hidden = false;
    loadOrderHistory();
    adminPanel.hidden = currentUser.role !== 'Admin';
    if (currentUser.role === 'Admin') {
        loadAdminOrders();
    }
}

async function loadOrderHistory() {
    if (!currentUser?.token) return;

    orderHistoryMessage.textContent = 'Đang tải đơn hàng...';

    try {
        const response = await fetch('/api/orders/me', {
            headers: authHeaders(false)
        });
        const data = await response.json();

        if (!response.ok) {
            orderHistoryMessage.textContent = data.message || 'Không tải được lịch sử đơn hàng.';
            return;
        }

        renderOrderHistory(Array.isArray(data.orders) ? data.orders : []);
    } catch {
        orderHistoryMessage.textContent = 'Không kết nối được server.';
    }
}

function renderOrderHistory(orders) {
    if (!orders.length) {
        orderHistoryList.innerHTML = '<p class="empty-cart">Chưa có đơn hàng.</p>';
        orderHistoryMessage.textContent = '';
        return;
    }

    orderHistoryList.innerHTML = orders.map((order) => {
        const items = Array.isArray(order.items) ? order.items : [];
        const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : '';
        const itemRows = items.map((item) => {
            const size = item.size ? ` - Size ${escapeHtml(item.size)}` : '';
            return `<li>${escapeHtml(item.name)}${size} x ${Number(item.quantity) || 0}</li>`;
        }).join('');

        return `
            <article class="order-history-card">
                <header>
                    <div>
                        <h4>${escapeHtml(order.orderId || '')}</h4>
                        <small>${escapeHtml(order.provider || '')} ${createdAt ? `- ${escapeHtml(createdAt)}` : ''}</small>
                    </div>
                    <span class="order-status">${escapeHtml(order.status || '')}</span>
                </header>
                <ul>${itemRows}</ul>
                <footer>
                    <span>${items.length} mặt hàng</span>
                    <strong>${currency.format(Number(order.amount) || 0)}</strong>
                </footer>
            </article>
        `;
    }).join('');
    orderHistoryMessage.textContent = '';
}

async function loadAdminOrders() {
    if (!currentUser?.token || currentUser.role !== 'Admin') return;

    adminOrdersMessage.textContent = 'Đang tải đơn hàng...';

    try {
        const response = await fetch('/api/orders', {
            headers: authHeaders(false)
        });
        const data = await response.json();

        if (!response.ok) {
            adminOrdersMessage.textContent = data.message || 'Không tải được lịch sử bán hàng.';
            return;
        }

        renderAdminOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch {
        adminOrdersMessage.textContent = 'Không kết nối được server.';
    }
}

function renderAdminOrders(orders) {
    if (!adminOrdersBody) return;

    if (!orders.length) {
        adminOrdersBody.innerHTML = `
            <tr>
                <td colspan="4">Chưa có đơn hàng.</td>
            </tr>
        `;
        adminOrdersMessage.textContent = '';
        return;
    }

    adminOrdersBody.innerHTML = orders.map((order) => {
        const customer = order.customer || {};
        const customerName = customer.fullName || customer.username || 'Khách hàng';
        const customerDetails = [
            customer.username ? `@${customer.username}` : '',
            customer.phone || '',
            customer.address || ''
        ].filter(Boolean).map(escapeHtml).join('<br>');
        const items = Array.isArray(order.items) ? order.items : [];
        const itemRows = items.map((item) => {
            const size = item.size ? `Size ${escapeHtml(item.size)} - ` : '';
            return `
                <span>${escapeHtml(item.name)} x ${Number(item.quantity) || 0}</span>
                <small>${size}${currency.format(Number(item.unitPrice) || 0)}</small>
            `;
        }).join('');

        return `
            <tr>
                <td>
                    <strong>${escapeHtml(order.orderId || '')}</strong>
                    <small>${escapeHtml(order.status || '')}</small>
                </td>
                <td>
                    <div class="admin-customer">
                        <span>${escapeHtml(customerName)}</span>
                        <small>${customerDetails}</small>
                    </div>
                </td>
                <td>
                    <div class="admin-order-items">${itemRows}</div>
                </td>
                <td><strong>${currency.format(Number(order.amount) || 0)}</strong></td>
            </tr>
        `;
    }).join('');
    adminOrdersMessage.textContent = '';
}

async function submitProfile(event) {
    event.preventDefault();

    if (!currentUser?.token) {
        profileMessage.textContent = 'Vui lòng đăng nhập.';
        showAuthModal();
        return;
    }

    profileMessage.textContent = 'Đang lưu thông tin...';

    try {
        const response = await fetch('/api/auth/me', {
            method: 'PUT',
            headers: authHeaders(true),
            body: JSON.stringify({
                fullName: profileFullName.value,
                phone: profilePhone.value,
                address: profileAddress.value
            })
        });
        const data = await response.json();

        if (!response.ok) {
            profileMessage.textContent = data.message || 'Không lưu được thông tin.';
            return;
        }

        currentUser = {
            ...currentUser,
            fullName: data.user.fullName || '',
            phone: data.user.phone || '',
            address: data.user.address || ''
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
        updateAccountUi();
        profileMessage.textContent = 'Đã lưu thông tin tài khoản.';
    } catch {
        profileMessage.textContent = 'Không kết nối được server.';
    }
}

async function submitAdminProduct(event) {
    event.preventDefault();

    if (!currentUser?.token || currentUser.role !== 'Admin') {
        adminMessage.textContent = 'Bạn cần đăng nhập Admin.';
        return;
    }

    const id = document.getElementById('adminProductId').value;
    const category = document.getElementById('adminCategory').value;
    const payload = {
        name: document.getElementById('adminName').value,
        category,
        displayCategory: displayCategoryFromType(category),
        price: Number(document.getElementById('adminPrice').value),
        image: document.getElementById('adminImage').value,
        sizes: splitList(document.getElementById('adminSizes').value),
        stock: parseStock(document.getElementById('adminStock').value),
        section: document.getElementById('adminSection').value
    };

    const url = id ? `/api/products/${id}` : '/api/products';
    const method = id ? 'PUT' : 'POST';
    adminMessage.textContent = 'Đang lưu...';

    try {
        const response = await fetch(url, {
            method,
            headers: adminHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (!response.ok) {
            adminMessage.textContent = data.message || 'Không lưu được sản phẩm.';
            return;
        }

        products = data.products || products;
        renderProducts();
        renderProductDetail();
        renderSearch(searchInput.value);
        renderAdminProducts();
        resetAdminForm();
        adminMessage.textContent = 'Đã lưu sản phẩm.';
    } catch {
        adminMessage.textContent = 'Không kết nối được server.';
    }
}

function renderAdminProducts() {
    if (!adminProductsBody) return;

    adminProductsBody.innerHTML = products.map((product) => `
        <tr>
            <td>
                <strong>${escapeHtml(product.name)}</strong>
                <small>${escapeHtml(product.section === 'new' ? 'Sản phẩm mới' : 'Tất cả sản phẩm')}</small>
            </td>
            <td>${escapeHtml(product.displayCategory)}</td>
            <td>${currency.format(Number(product.price) || 0)}</td>
            <td>${escapeHtml(formatStock(product))}</td>
            <td>
                <div class="admin-row-actions">
                    <button type="button" data-admin-edit="${product.id}">Sửa</button>
                    <button type="button" data-admin-delete="${product.id}">Xóa</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function fillAdminForm(productId) {
    const product = products.find((item) => Number(item.id) === Number(productId));
    if (!product) return;

    document.getElementById('adminProductId').value = product.id;
    document.getElementById('adminName').value = product.name;
    document.getElementById('adminCategory').value = product.category;
    document.getElementById('adminPrice').value = product.price;
    document.getElementById('adminImage').value = product.image;
    document.getElementById('adminSizes').value = getProductSizes(product).join(',');
    document.getElementById('adminStock').value = formatStock(product);
    document.getElementById('adminSection').value = product.section || 'products';
    adminMessage.textContent = 'Đang sửa sản phẩm.';
    adminPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteAdminProduct(productId) {
    if (!currentUser?.token || currentUser.role !== 'Admin') return;
    if (!confirm('Xóa sản phẩm này?')) return;

    try {
        const response = await fetch(`/api/products/${productId}`, {
            method: 'DELETE',
            headers: adminHeaders()
        });
        const data = await response.json();

        if (!response.ok) {
            adminMessage.textContent = data.message || 'Không xóa được sản phẩm.';
            return;
        }

        products = data.products || products.filter((product) => product.id !== productId);
        cart = cart.filter((item) => Number(item.productId) !== Number(productId));
        saveCart();
        renderProducts();
        renderProductDetail();
        renderSearch(searchInput.value);
        renderCart();
        renderAdminProducts();
        adminMessage.textContent = 'Đã xóa sản phẩm.';
    } catch {
        adminMessage.textContent = 'Không kết nối được server.';
    }
}

function resetAdminForm() {
    adminProductForm.reset();
    document.getElementById('adminProductId').value = '';
}

function authHeaders(includeJson = true) {
    const headers = {};

    if (includeJson) {
        headers['Content-Type'] = 'application/json';
    }

    if (currentUser?.token) {
        headers.Authorization = `Bearer ${currentUser.token}`;
    }

    return headers;
}

function adminHeaders() {
    return {
        ...authHeaders(true)
    };
}

function extractProductsFromDom() {
    return Array.from(document.querySelectorAll('.product-card-shell, .product-grid > .product-card')).map((card, index) => {
        const displayCategory = card.dataset.category || 'Accessory';
        const category = productTypeFromDisplay(displayCategory);
        const sizes = defaultSizesForCategory(category);
        const stock = sizes.reduce((result, size) => {
            result[size] = 5;
            return result;
        }, {});

        return {
            id: index + 1,
            name: card.dataset.name || `Product ${index + 1}`,
            category,
            displayCategory,
            price: Number(card.dataset.price) || 0,
            image: card.querySelector('img')?.getAttribute('src') || '',
            section: card.closest('#new') ? 'new' : 'products',
            sizes,
            stock
        };
    });
}

function productFromCard(card, button) {
    if (!card && !button) return null;

    return {
        id: Number(button?.dataset.productId || card?.dataset.productId || Date.now()),
        name: button?.dataset.name || card?.dataset.name || 'Sản phẩm',
        category: card?.dataset.type || productTypeFromDisplay(card?.dataset.category || ''),
        displayCategory: card?.dataset.category || 'Accessory',
        price: Number(button?.dataset.price || card?.dataset.price || 0),
        sizes: [],
        stock: {}
    };
}

function requiresSize(product) {
    return ['shoes', 'clothing'].includes(product.category) || getProductSizes(product).length > 0;
}

function canAddQuantity(product, size, currentQuantity) {
    if (!requiresSize(product)) return true;
    if (!size) return false;
    const stock = Number(product.stock?.[String(size)] || 0);
    return currentQuantity + 1 <= stock;
}

function getProductSizes(product) {
    return Array.isArray(product.sizes) ? product.sizes.map((size) => String(size)) : [];
}

function displayCategoryFromType(category) {
    if (category === 'shoes') return 'Sneaker';
    if (category === 'clothing') return 'Apparel';
    return 'Accessory';
}

function productTypeFromDisplay(displayCategory) {
    const normalized = String(displayCategory || '').toLowerCase();
    if (normalized === 'sneaker') return 'shoes';
    if (normalized === 'apparel') return 'clothing';
    return 'accessory';
}

function defaultSizesForCategory(category) {
    if (category === 'shoes') return ['39', '40', '41', '42', '43'];
    if (category === 'clothing') return ['S', 'M', 'L', 'XL'];
    return [];
}

function splitList(value) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseStock(value) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .reduce((stock, entry) => {
            const [size, qty] = entry.split(':').map((part) => part.trim());
            if (size) stock[size] = Math.max(0, Number(qty) || 0);
            return stock;
        }, {});
}

function formatStock(product) {
    const sizes = getProductSizes(product);
    if (!sizes.length) return 'Không size';

    return sizes.map((size) => {
        return `${size}:${Number(product.stock?.[String(size)] || 0)}`;
    }).join(',');
}

function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function loadJson(key, fallback) {
    try {
        const data = JSON.parse(localStorage.getItem(key));
        return data || fallback;
    } catch {
        return fallback;
    }
}

function normalizeCartItem(item) {
    if (!item || typeof item !== 'object') return null;

    const productId = Number(item.productId || item.id);
    const quantity = Number(item.quantity || item.qty);

    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
        return null;
    }

    return {
        productId,
        name: String(item.name || ''),
        size: item.size === null || item.size === undefined ? null : String(item.size),
        quantity,
        price: Number(item.price) || 0
    };
}

function normalizeSession(session) {
    if (!session || typeof session !== 'object' || !session.token) return null;

    return {
        username: String(session.username || ''),
        id: session.id || null,
        role: session.role === 'Admin' ? 'Admin' : 'User',
        fullName: String(session.fullName || ''),
        phone: String(session.phone || ''),
        address: String(session.address || ''),
        token: String(session.token),
        expiresAt: session.expiresAt || null
    };
}

function hasCompleteProfile(user) {
    return Boolean(
        String(user?.fullName || '').trim() &&
        String(user?.phone || '').trim() &&
        String(user?.address || '').trim()
    );
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
    return escapeHtml(value);
}
