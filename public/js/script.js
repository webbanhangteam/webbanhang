const currency = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
});

const SESSION_KEY = 'shopSession';
const CART_KEY = 'shopCart';
const WISHLIST_KEY = 'shopWishlist';
const CONTENT_URL = '/content.json';
const ADMIN_ORDER_STREAM_RECONNECT_MS = 3000;
const ORDER_FULFILLMENT_STEPS = [
    { value: 'ORDERED', label: 'Đã đặt hàng' },
    { value: 'PREPARING', label: 'Đã xác nhận / đang chuẩn bị hàng' },
    { value: 'SHIPPING', label: 'Đang giao' },
    { value: 'DELIVERED', label: 'Đã nhận hàng' }
];

let products = [];
let cart = loadJson(CART_KEY, []).map(normalizeCartItem).filter(Boolean);
let currentUser = normalizeSession(loadJson(SESSION_KEY, null));
let wishlist = new Set(loadJson(WISHLIST_KEY, []).map((id) => Number(id)).filter(Boolean));
let currentDetailProductId = null;
let siteContent = {};
let adminOrders = [];
let adminOrderStreamController = null;
let adminOrderStreamReconnectTimer = null;
let adminOrderStreamGeneration = 0;
let userOrders = [];
let userOrderStreamController = null;
let userOrderStreamReconnectTimer = null;
let userOrderStreamGeneration = 0;

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
const adminNewOrdersBadge = document.getElementById('adminNewOrdersBadge');
const profileLoggedOut = document.getElementById('profileLoggedOut');
const profileLoggedIn = document.getElementById('profileLoggedIn');
const profileAvatarLetter = document.getElementById('profileAvatarLetter');
const profileDisplayName = document.getElementById('profileDisplayName');
const profileRoleBadge = document.getElementById('profileRoleBadge');
const logoutButtonProfile = document.getElementById('logoutButtonProfile');
const wishlistGrid = document.getElementById('wishlistGrid');
const relatedProductsGrid = document.getElementById('relatedProductsGrid');
const detailBreadcrumbName = document.getElementById('detailBreadcrumbName');
const detailCategoryBadge = document.getElementById('detailCategoryBadge');
const adminImagePreview = document.getElementById('adminImagePreview');
const statProductCount = document.getElementById('statProductCount');
const statOrderCount = document.getElementById('statOrderCount');
const statRevenue = document.getElementById('statRevenue');
const authModal = document.getElementById('authModal');
const authFormTitle = document.getElementById('authFormTitle');
const authFormSubtitle = document.getElementById('authFormSubtitle');
const loginTabV2 = document.getElementById('loginTabV2');
const registerTabV2 = document.getElementById('registerTabV2');
const loginPaneV2 = document.getElementById('loginPaneV2');
const registerPaneV2 = document.getElementById('registerPaneV2');

loadSiteContent().finally(() => {
    init();
});

async function init() {
    applySiteContent();
    bindStaticEvents();
    renderProductSkeletons();
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

async function loadSiteContent() {
    try {
        const response = await fetch(CONTENT_URL, { cache: 'no-store' });
        if (!response.ok) return;

        const data = await response.json();
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            siteContent = data;
        }
    } catch {
        siteContent = {};
    }
}

function applySiteContent() {
    const title = contentText('meta.title', '');
    if (title) document.title = title;

    const description = contentText('meta.description', '');
    const metaDescription = document.querySelector('meta[name="description"]');
    if (description && metaDescription) {
        metaDescription.setAttribute('content', description);
    }

    (siteContent.static || []).forEach(applyContentEntry);
}

function applyContentEntry(entry) {
    if (!entry?.selector) return;

    let elements = [];
    try {
        elements = document.querySelectorAll(entry.selector);
    } catch (err) {
        console.warn(`Invalid content selector "${entry.selector}":`, err);
        return;
    }

    elements.forEach((element, index) => {
        const text = indexedContentValue(entry.text, index);
        if (text !== null) element.textContent = text;

        const html = indexedContentValue(entry.html, index);
        if (html !== null) element.innerHTML = html;

        const textNode = indexedContentValue(entry.textNode, index);
        if (textNode !== null) setFirstTextNode(element, textNode);

        Object.entries(entry.attrs || {}).forEach(([attr, value]) => {
            const attrValue = indexedContentValue(value, index);
            if (attrValue !== null) element.setAttribute(attr, attrValue);
        });
    });
}

function indexedContentValue(value, index) {
    if (Array.isArray(value)) {
        return value[index] === undefined || value[index] === null ? null : String(value[index]);
    }

    return value === undefined || value === null ? null : String(value);
}

function setFirstTextNode(element, text) {
    const textNode = Array.from(element.childNodes).find((node) => {
        return node.nodeType === Node.TEXT_NODE && node.textContent.trim();
    });

    if (textNode) {
        textNode.textContent = `\n                        ${text}\n                        `;
        return;
    }

    element.insertBefore(document.createTextNode(text), element.firstChild);
}

function contentText(path, fallback = '') {
    const value = path.split('.').reduce((current, key) => {
        if (current && Object.prototype.hasOwnProperty.call(current, key)) {
            return current[key];
        }
        return undefined;
    }, siteContent);

    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return fallback;
}

function contentTemplate(path, values, fallback = '') {
    return contentText(path, fallback).replace(/\{(\w+)\}/g, (_, key) => {
        return values[key] === undefined || values[key] === null ? '' : String(values[key]);
    });
}

function bindStaticEvents() {
    document.addEventListener('click', handleDocumentClick);

    searchInput.addEventListener('input', () => {
        renderSearch(searchInput.value);
    });

    const searchModal = document.getElementById('searchModal');
    if (searchModal) {
        searchModal.addEventListener('shown.bs.modal', () => {
            searchInput.focus();
            renderSearch(searchInput.value);
        });
    }

    document.getElementById('momoCheckout').addEventListener('click', () => {
        startPayment('momo');
    });

    document.getElementById('zaloCheckout').addEventListener('click', () => {
        startPayment('zalopay');
    });

    document.getElementById('codCheckout').addEventListener('click', () => {
        startCodCheckout();
    });

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            await submitAuth('/api/auth/login', {
                username: document.getElementById('loginUsername').value,
                password: document.getElementById('loginPassword').value
            }, document.getElementById('loginMessage'));
        });
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            await submitAuth('/api/auth/register', {
                username: document.getElementById('registerUsername').value,
                password: document.getElementById('registerPassword').value
            }, document.getElementById('registerMessage'));
        });
    }

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

    if (logoutButtonProfile) {
        logoutButtonProfile.addEventListener('click', async () => {
            await logout();
        });
    }

    if (profileForm) {
        profileForm.addEventListener('submit', submitProfile);
    }

    if (refreshOrdersButton) {
        refreshOrdersButton.addEventListener('click', () => {
            loadOrderHistory();
        });
    }

    if (refreshAdminOrdersButton) {
        refreshAdminOrdersButton.addEventListener('click', () => {
            loadAdminOrders();
        });
    }

    if (adminProductForm) {
        adminProductForm.addEventListener('submit', submitAdminProduct);
    }

    const cancelAdminEdit = document.getElementById('cancelAdminEdit');
    if (cancelAdminEdit) {
        cancelAdminEdit.addEventListener('click', () => {
            resetAdminForm();
        });
    }

    document.querySelectorAll('[data-profile-tab]').forEach((button) => {
        button.addEventListener('click', () => switchProfileTab(button.dataset.profileTab));
    });

    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
        button.addEventListener('click', () => switchAdminTab(button.dataset.adminTab));
    });

    document.querySelectorAll('[data-detail-tab]').forEach((button) => {
        button.addEventListener('click', () => switchDetailTab(button.dataset.detailTab));
    });

    const adminImage = document.getElementById('adminImage');
    if (adminImage) {
        adminImage.addEventListener('input', updateAdminImagePreview);
    }

    bindAuthModalEvents();
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
            await fetch('/api/auth/logout', {
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
    stopAdminOrderNotifications();
    stopUserOrderNotifications();
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
        toggleWishlist(wishlistButton);
        return;
    }

    const productMedia = event.target.closest('.product-media');
    if (productMedia) {
        const card = productMedia.closest('[data-product-id]');
        if (card) renderProductDetail(Number(card.dataset.productId));
        return;
    }

    const detailThumb = event.target.closest('.detail-gallery .thumbs img');
    if (detailThumb) {
        updateDetailMainImage(detailThumb);
        return;
    }

    const addButton = event.target.closest('.add-to-cart, .add-detail-cart');
    if (addButton) {
        addProductFromButton(addButton);
        return;
    }

    const sizeButton = event.target.closest('.size-list button');
    if (sizeButton) {
        if (sizeButton.disabled) return;
        sizeButton.closest('.size-list')?.querySelectorAll('button').forEach((button) => {
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

    const relatedButton = event.target.closest('.related-product-card');
    if (relatedButton) {
        scrollToProduct(relatedButton.dataset.productId);
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
        return;
    }

    const seenOrderButton = event.target.closest('[data-order-seen]');
    if (seenOrderButton) {
        markAdminOrderSeen(Number(seenOrderButton.dataset.orderSeen));
        return;
    }

    const fulfillmentButton = event.target.closest('[data-order-fulfillment]');
    if (fulfillmentButton) {
        updateAdminOrderFulfillment(
            Number(fulfillmentButton.dataset.orderId),
            fulfillmentButton.dataset.orderFulfillment
        );
        return;
    }

    const receivedButton = event.target.closest('[data-order-received]');
    if (receivedButton) {
        confirmUserOrderReceived(Number(receivedButton.dataset.orderReceived));
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
        products = [];
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
                price: getProductSalePrice(product)
            };
        }

        return {
            productId: Number(product.id),
            name: product.name,
            size: null,
            quantity: clampQuantity(product, Math.max(1, Number(item.quantity) || 1)),
            price: getProductSalePrice(product)
        };
    }).filter(Boolean);

    saveCart();
}

function renderProducts() {
    if (!products.length) {
        renderProductEmptyState();
        return;
    }

    if (productGrid) {
        productGrid.classList.remove('product-loading');
        productGrid.classList.add('row', 'g-4');
        productGrid.innerHTML = products
            .filter((product) => product.section === 'new')
            .map((product) => renderProductCard(product, true))
            .join('');
    }

    if (secondaryProducts) {
        secondaryProducts.classList.remove('product-loading');
        secondaryProducts.classList.add('row', 'g-4');
        secondaryProducts.innerHTML = products
            .map((product) => renderProductCard(product, false))
            .join('');
    }

    applyActiveFilter();
    renderWishlist();
    renderAdminStats();
}

function renderProductSkeletons() {
    const skeletons = Array.from({ length: 4 }, () => `
        <div class="col-12 col-sm-6 col-lg-4 col-xl-3">
            <div class="skeleton-card">
                <div class="skeleton skeleton-media"></div>
                <div class="skeleton-body">
                    <div class="skeleton skeleton-line short"></div>
                    <div class="skeleton skeleton-line medium"></div>
                    <div class="skeleton skeleton-line"></div>
                </div>
            </div>
        </div>
    `).join('');

    [productGrid, secondaryProducts].filter(Boolean).forEach((container) => {
        container.classList.add('row', 'g-4', 'product-loading');
        container.innerHTML = skeletons;
    });
}

function renderProductEmptyState() {
    [productGrid, secondaryProducts].filter(Boolean).forEach((container) => {
        container.classList.remove('product-loading');
        container.innerHTML = `<p class="empty-cart">${escapeHtml(contentText('messages.products.empty', 'Chưa tải được danh sách sản phẩm.'))}</p>`;
    });
}

function renderProductCard(product, showWishlist) {
    const sizes = getProductSizes(product);
    const wished = wishlist.has(Number(product.id));
    const salePercent = getProductSalePercent(product);
    const basePrice = getProductBasePrice(product);
    const salePrice = getProductSalePrice(product);
    const outOfStock = isProductOutOfStock(product);
    const addButtonText = outOfStock
        ? contentText('buttons.soldOut', 'Hết hàng')
        : contentText('buttons.addShort', 'Thêm');
    const priceHtml = salePercent
        ? `<div class="price-stack"><strong>${currency.format(salePrice)}</strong><del>${currency.format(basePrice)}</del></div>`
        : `<strong>${currency.format(basePrice)}</strong>`;
    const saleBadge = salePercent ? `<span class="sale-badge">-${salePercent}%</span>` : '';
    const chooseSize = contentText('labels.chooseSize', 'Chọn size');
    const soldOut = contentText('labels.soldOut', 'hết hàng');
    const sizeSelect = sizes.length ? `
        <select class="product-size-select" data-size-for="${product.id}" aria-label="${escapeAttr(contentTemplate('labels.chooseSizeFor', { name: product.name }, 'Chọn size {name}'))}">
            <option value="">${escapeHtml(chooseSize)}</option>
            ${sizes.map((size) => {
        const qty = Number(product.stock?.[String(size)] || 0);
        const disabled = qty <= 0 ? ' disabled' : '';
        const label = qty <= 0 ? `${size} - ${soldOut}` : `${size} (${qty})`;
        return `<option value="${escapeAttr(size)}"${disabled}>${escapeHtml(label)}</option>`;
    }).join('')}
        </select>
    ` : '';

    return `
        <article class="product-card-shell col-12 col-sm-6 col-lg-4 col-xl-3" data-product-id="${product.id}"
            data-name="${escapeAttr(product.name)}" data-category="${escapeAttr(product.displayCategory)}"
            data-type="${escapeAttr(product.category)}" data-price="${salePrice}">
            <div class="product-card card h-full border-0 shadow-sm rounded-xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
                ${saleBadge}
                ${showWishlist ? `<button class="wishlist-btn shadow-sm transition-all duration-300 hover:scale-105${wished ? ' active' : ''}" type="button" aria-label="${escapeAttr(contentText('labels.wishlist', 'Yêu thích'))}" data-product-id="${product.id}"><i class="bi ${wished ? 'bi-heart-fill' : 'bi-heart'}"></i></button>` : ''}
                <a class="product-media block overflow-hidden bg-gray-100" href="#product-detail">
                    <img class="w-full object-cover transition-transform duration-300" src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}" loading="lazy">
                    <span class="product-hover-detail">
                        <strong>${escapeHtml(contentText('labels.productDetail', 'Chi tiết sản phẩm'))}</strong>
                        <small>${escapeHtml(getProductDescription(product))}</small>
                        <small>${escapeHtml(getStockSummary(product))}</small>
                    </span>
                </a>
                <div class="product-info p-4">
                    <span class="text-xs font-extrabold uppercase text-rose-600">${escapeHtml(product.displayCategory)}</span>
                    <h3 class="text-base font-extrabold leading-snug">${escapeHtml(product.name)}</h3>
                    ${sizeSelect}
                    <div class="product-bottom">
                        ${priceHtml}
                        <button class="add-to-cart rounded-lg bg-neutral-950 px-4 py-2 text-xs font-extrabold uppercase text-white transition-all duration-300 hover:scale-105 hover:bg-rose-700" type="button" data-product-id="${product.id}"${outOfStock ? ' disabled' : ''}>${escapeHtml(addButtonText)}</button>
                    </div>
                </div>
            </div>
        </article>
    `;
}

function renderProductDetail(productId = currentDetailProductId) {
    const normalizedId = Number(productId);
    const product = products.find((item) => Number(item.id) === normalizedId) || products[0];
    if (!product) return;
    currentDetailProductId = Number(product.id);

    const detailCard = document.querySelector('.detail-card');
    const detailButton = document.querySelector('.add-detail-cart');
    const sizeList = document.querySelector('.detail-card .size-list');
    const title = document.querySelector('.detail-card h2');
    const price = document.querySelector('.detail-price');
    const desc = document.querySelector('.detail-desc');
    const gallery = document.querySelector('.detail-gallery');
    const outOfStock = isProductOutOfStock(product);

    if (title) title.textContent = product.name;
    if (price) price.innerHTML = renderPrice(product);
    if (desc) desc.textContent = getProductDescription(product);
    if (detailBreadcrumbName) detailBreadcrumbName.textContent = product.name;
    if (detailCategoryBadge) detailCategoryBadge.textContent = product.displayCategory || 'Best seller';
    if (gallery) renderDetailGallery(gallery, product);
    renderDetailDescription(product);
    renderRelatedProducts(product);

    if (detailCard) {
        detailCard.dataset.productId = product.id;
        detailCard.dataset.name = product.name;
        detailCard.dataset.price = getProductSalePrice(product);
    }

    if (detailButton) {
        detailButton.dataset.productId = product.id;
        detailButton.dataset.name = product.name;
        detailButton.dataset.price = getProductSalePrice(product);
        detailButton.disabled = outOfStock;
        detailButton.innerHTML = outOfStock
            ? `<i class="bi bi-x-circle"></i> ${escapeHtml(contentText('buttons.soldOut', 'Hết hàng'))}`
            : `<i class="bi bi-bag-plus"></i> ${escapeHtml(contentText('buttons.addToCart', 'Thêm vào giỏ'))}`;
    }

    if (sizeList) {
        const sizes = getProductSizes(product);
        const firstAvailableIndex = sizes.findIndex((size) => {
            return Number(product.stock?.[String(size)] || 0) > 0;
        });
        sizeList.innerHTML = sizes.map((size, index) => {
            const disabled = Number(product.stock?.[String(size)] || 0) <= 0 ? ' disabled' : '';
            const selected = index === firstAvailableIndex ? ' class="selected"' : '';
            const stockLabel = Number(product.stock?.[String(size)] || 0) <= 0 ? contentText('labels.soldOut', 'hết hàng') : `${Number(product.stock?.[String(size)] || 0)} còn`;
            return `<button type="button" data-size="${escapeAttr(size)}"${selected}${disabled} title="${escapeAttr(stockLabel)}">${escapeHtml(size)}</button>`;
        }).join('');
    }
}

function renderDetailGallery(gallery, product) {
    const images = getProductImages(product);
    const [mainImage, ...thumbImages] = images;

    gallery.innerHTML = `
        <img src="${escapeAttr(mainImage)}" alt="${escapeAttr(product.name)}" loading="lazy" decoding="async">
        <div class="thumbs">
            ${(thumbImages.length ? thumbImages : images).slice(0, 3).map((image, index) => {
        return `<img src="${escapeAttr(image)}" alt="${escapeAttr(product.name)} ${index + 1}" loading="lazy" decoding="async"${index === 0 ? ' class="active"' : ''}>`;
    }).join('')}
        </div>
    `;
}

function updateDetailMainImage(thumbnail) {
    const gallery = thumbnail.closest('.detail-gallery');
    const mainImage = gallery?.querySelector(':scope > img');
    if (!mainImage) return;

    mainImage.src = thumbnail.src;
    mainImage.alt = thumbnail.alt || mainImage.alt;
    gallery.querySelectorAll('.thumbs img').forEach((image) => image.classList.remove('active'));
    thumbnail.classList.add('active');
}

function renderDetailDescription(product) {
    const descriptionPane = document.getElementById('detailTabDescription');
    if (!descriptionPane) return;

    descriptionPane.innerHTML = `
        <h3>${escapeHtml(contentText('labels.productDescriptionTitle', 'Mô tả sản phẩm'))}</h3>
        <p>${escapeHtml(getProductDescription(product))}</p>
        <p>${escapeHtml(getStockSummary(product))}</p>
    `;
}

function renderRelatedProducts(product) {
    if (!relatedProductsGrid) return;

    const related = products
        .filter((item) => Number(item.id) !== Number(product.id) && item.category === product.category)
        .slice(0, 4);

    relatedProductsGrid.innerHTML = related.length
        ? related.map((item) => renderRelatedProductCard(item)).join('')
        : `<p class="empty-cart">${escapeHtml(contentText('messages.products.noRelated', 'Chưa có sản phẩm liên quan.'))}</p>`;
}

function renderRelatedProductCard(product) {
    return `
        <button class="related-product-card" type="button" data-product-id="${product.id}">
            <img src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}" loading="lazy" decoding="async">
            <span>${escapeHtml(product.name)}</span>
            ${renderPrice(product)}
        </button>
    `;
}

function getProductImages(product) {
    const images = Array.isArray(product.images) ? product.images : [];
    const allImages = [product.image, ...images]
        .map((image) => String(image || '').trim())
        .filter(Boolean);

    return allImages.length ? Array.from(new Set(allImages)) : ['https://images.unsplash.com/photo-1600269452121-4f2416e55c28?auto=format&fit=crop&w=1200&q=84'];
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

    if (isProductOutOfStock(product)) {
        showToast(contentText('messages.cart.outOfStock', 'Sản phẩm tạm hết hàng'), 'error');
        return;
    }

    let size = '';
    if (requiresSize(product)) {
        if (button.classList.contains('add-detail-cart')) {
            size = document.querySelector('.detail-card .size-list button.selected')?.dataset.size || '';
        } else {
            size = productContainer?.querySelector('.product-size-select')?.value || '';
        }

        if (!size) {
            showToast(contentText('messages.cart.chooseSize', 'Vui lòng chọn size'), 'error');
            return;
        }

        if (Number(product.stock?.[String(size)] || 0) <= 0) {
            showToast(contentText('messages.cart.sizeSoldOut', 'Size này tạm hết hàng'), 'error');
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
        showToast(contentText('messages.cart.quantityOverStock', 'Số lượng vượt quá tồn kho'), 'error');
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
            price: getProductSalePrice(product)
        });
    }

    saveCart();
    renderCart();
    animateCartIcon();
    showToast(contentTemplate('messages.cart.added', { name: product.name }, 'Đã thêm {name} vào giỏ'), 'success');
}

function changeCartQty(index, change) {
    const item = cart[index];
    if (!item) return;

    const product = products.find((entry) => Number(entry.id) === Number(item.productId));

    if (change > 0 && product && !canAddQuantity(product, item.size || '', item.quantity)) {
        showToast(contentText('messages.cart.quantityOverStock', 'Số lượng vượt quá tồn kho'), 'error');
        return;
    }

    item.quantity += change;

    if (item.quantity <= 0) {
        cart.splice(index, 1);
    }

    saveCart();
    renderCart();
}

function toggleWishlist(button) {
    const productId = Number(button.dataset.productId || button.closest('[data-product-id]')?.dataset.productId);
    if (!productId) return;

    if (wishlist.has(productId)) {
        wishlist.delete(productId);
        button.classList.remove('active');
        button.innerHTML = '<i class="bi bi-heart"></i>';
    } else {
        wishlist.add(productId);
        button.classList.add('active');
        button.innerHTML = '<i class="bi bi-heart-fill"></i>';
    }

    localStorage.setItem(WISHLIST_KEY, JSON.stringify(Array.from(wishlist)));
    renderWishlist();
}

function renderWishlist() {
    if (!wishlistGrid) return;

    const wishedProducts = products.filter((product) => wishlist.has(Number(product.id)));
    wishlistGrid.innerHTML = wishedProducts.length
        ? wishedProducts.map((product) => renderRelatedProductCard(product)).join('')
        : `<p class="empty-cart">${escapeHtml(contentText('messages.wishlist.empty', 'Chưa có sản phẩm yêu thích.'))}</p>`;
}

function animateCartIcon() {
    const cartButton = document.querySelector('.cart-trigger');
    if (!cartButton) return;

    cartButton.classList.remove('cart-pulse');
    requestAnimationFrame(() => {
        cartButton.classList.add('cart-pulse');
        setTimeout(() => cartButton.classList.remove('cart-pulse'), 500);
    });
}

function showToast(message, type = 'info', duration = 3000) {
    let region = document.querySelector('.toast-region');
    if (!region) {
        region = document.createElement('div');
        region.className = 'toast-region';
        region.setAttribute('aria-live', 'polite');
        document.body.appendChild(region);
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message;
    region.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 250);
    }, duration);
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
        cartItems.innerHTML = `<p class="empty-cart">${escapeHtml(contentText('messages.cart.empty', 'Chưa có sản phẩm trong giỏ.'))}</p>`;
        return;
    }

    const sizeLabel = contentText('labels.size', 'Size');
    const decreaseQty = contentText('labels.decreaseQty', 'Giảm số lượng');
    const increaseQty = contentText('labels.increaseQty', 'Tăng số lượng');

    cartItems.innerHTML = cart.map((item, index) => `
        <div class="cart-line">
            <div>
                <strong>${escapeHtml(item.name)}</strong>
                ${item.size ? `<small>${escapeHtml(sizeLabel)}: ${escapeHtml(item.size)}</small>` : ''}
                <span>${currency.format(Number(item.price) || 0)}</span>
            </div>
            <div class="qty-controls">
                <button type="button" data-qty="${index}" data-change="-1" aria-label="${escapeAttr(decreaseQty)}">-</button>
                <span>${Number(item.quantity) || 0}</span>
                <button type="button" data-qty="${index}" data-change="1" aria-label="${escapeAttr(increaseQty)}">+</button>
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
            ${renderPrice(product)}
        </button>
    `).join('');
}

function scrollToProduct(productId) {
    const card = document.querySelector(`[data-product-id="${CSS.escape(String(productId))}"]`);
    renderProductDetail(Number(productId));
    const modal = bootstrap.Modal.getInstance(document.getElementById('searchModal'));
    if (modal) modal.hide();

    const target = document.getElementById('product-detail') || card;
    if (target) {
        target.scrollIntoView({
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
        checkoutMessage.textContent = contentText('messages.payment.needItems', 'Vui lòng thêm sản phẩm trước khi thanh toán.');
        return;
    }

    if (!currentUser?.token) {
        checkoutMessage.textContent = contentText('messages.payment.needLogin', 'Vui lòng đăng nhập trước khi thanh toán.');
        showAuthModal();
        return;
    }

    checkoutMessage.textContent = contentText('messages.payment.creating', 'Đang tạo phiên thanh toán...');

    try {
        const response = await fetch(`/api/payments/${provider}`, {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({
                orderInfo: contentText('messages.payment.orderInfo', 'Thanh toán đơn hàng Chill n Free'),
                description: contentText('messages.payment.orderDescription', 'Thanh toán đơn hàng Chill n Free'),
                items: getCheckoutItems()
            })
        });

        const data = await response.json();

        if (data.paymentUrl) {
            window.location.href = data.paymentUrl;
            return;
        }

        checkoutMessage.textContent = data.message || contentText('messages.payment.linkFailed', 'Chưa tạo được liên kết thanh toán.');
    } catch {
        checkoutMessage.textContent = contentText('messages.payment.gatewayDisconnected', 'Không kết nối được cổng thanh toán.');
    }
}

async function startCodCheckout() {
    const amount = cart.reduce((sum, item) => {
        return sum + Number(item.price || 0) * Number(item.quantity || 0);
    }, 0);

    if (!amount) {
        checkoutMessage.textContent = contentText('messages.cod.needItems', 'Vui lòng thêm sản phẩm trước khi đặt COD.');
        return;
    }

    if (!currentUser?.token) {
        checkoutMessage.textContent = contentText('messages.cod.needLogin', 'Vui lòng đăng nhập trước khi đặt COD.');
        showAuthModal();
        return;
    }

    if (!hasCompleteProfile(currentUser)) {
        checkoutMessage.textContent = contentText('messages.cod.profileMissing', 'Vui lòng cập nhật tên, số điện thoại và địa chỉ ở tài khoản.');
        location.hash = 'account';
        profileFullName.focus();
        return;
    }

    checkoutMessage.textContent = contentText('messages.cod.creating', 'Đang tạo đơn COD...');

    try {
        const response = await fetch('/api/payments/cod', {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({
                description: contentText('messages.cod.description', 'Thanh toán khi nhận hàng'),
                items: getCheckoutItems()
            })
        });
        const data = await response.json();

        if (!response.ok) {
            checkoutMessage.textContent = data.message || contentText('messages.cod.createFailed', 'Không tạo được đơn COD.');
            return;
        }

        cart = [];
        saveCart();
        renderCart();
        if (Array.isArray(data.products)) {
            products = data.products;
        } else {
            await loadProducts();
        }
        syncCartWithProducts();
        renderProducts();
        renderProductDetail();
        renderSearch(searchInput.value);
        await loadOrderHistory();
        if (currentUser.role === 'Admin') {
            await loadAdminOrders();
        }
        checkoutMessage.textContent = contentTemplate('messages.cod.created', { orderId: data.orderId }, 'Đã tạo đơn COD {orderId}.');
    } catch {
        checkoutMessage.textContent = contentText('messages.common.serverDisconnected', 'Không kết nối được server.');
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
    messageElement.textContent = contentText('messages.auth.processing', 'Đang xử lý...');

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
            messageElement.textContent = data.message || contentText('messages.auth.requestFailed', 'Không xử lý được yêu cầu.');
            return;
        }

        if (!data.token) {
            messageElement.textContent = contentText('messages.auth.invalidSession', 'Phiên đăng nhập không hợp lệ.');
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
        messageElement.textContent = contentText('messages.auth.success', 'Đăng nhập thành công.');
        updateAccountUi();

        const modal = bootstrap.Modal.getInstance(document.getElementById('authModal'));
        if (modal) modal.hide();
    } catch {
        messageElement.textContent = contentText('messages.common.serverDisconnected', 'Không kết nối được server.');
    }
}

function showAuthModal() {
    setAuthMode('login');
    bootstrap.Modal.getOrCreateInstance(authModal).show();
}

function bindAuthModalEvents() {
    if (loginTabV2) {
        loginTabV2.addEventListener('click', () => setAuthMode('login'));
    }

    if (registerTabV2) {
        registerTabV2.addEventListener('click', () => setAuthMode('register'));
    }

    document.querySelectorAll('.auth-pane .password-toggle').forEach((button) => {
        button.addEventListener('click', () => {
            const input = button.closest('.auth-input-group')?.querySelector('input[type="password"], input[type="text"]');
            if (!input) return;

            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            button.setAttribute('aria-label', isHidden ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = isHidden ? 'bi bi-eye-slash' : 'bi bi-eye';
            }
        });
    });

    if (authModal) {
        authModal.addEventListener('shown.bs.modal', () => {
            setAuthMode('login');
            document.getElementById('loginUsername')?.focus();
        });

        authModal.addEventListener('hidden.bs.modal', () => {
            setAuthMode('login');
            clearAuthMessages();
        });
    }
}

function setAuthMode(mode) {
    const isRegister = mode === 'register';
    if (loginTabV2) loginTabV2.classList.toggle('active', !isRegister);
    if (registerTabV2) registerTabV2.classList.toggle('active', isRegister);
    if (loginPaneV2) loginPaneV2.classList.toggle('active', !isRegister);
    if (registerPaneV2) registerPaneV2.classList.toggle('active', isRegister);
    if (authFormTitle) authFormTitle.textContent = isRegister ? 'Đăng ký' : 'Đăng nhập';
    if (authFormSubtitle) {
        authFormSubtitle.textContent = isRegister
            ? 'Tạo tài khoản để lưu đơn hàng và đồng bộ thông tin'
            : 'Nhập thông tin tài khoản của bạn';
    }
    clearAuthMessages();
}

function clearAuthMessages() {
    const loginMessage = document.getElementById('loginMessage');
    const registerMessage = document.getElementById('registerMessage');
    if (loginMessage) loginMessage.textContent = '';
    if (registerMessage) registerMessage.textContent = '';
}

function switchProfileTab(tab) {
    const normalizedTab = tab || 'info';
    document.querySelectorAll('[data-profile-tab]').forEach((button) => {
        button.classList.toggle('active', button.dataset.profileTab === normalizedTab);
    });

    ['info', 'orders', 'wishlist'].forEach((name) => {
        const panel = document.getElementById(`profileTab${capitalize(name)}`);
        if (panel) panel.classList.toggle('hidden', name !== normalizedTab);
    });

    if (normalizedTab === 'orders') loadOrderHistory();
    if (normalizedTab === 'wishlist') renderWishlist();
}

function updateAccountUi() {
    if (!currentUser?.token) {
        stopAdminOrderNotifications();
        stopUserOrderNotifications();
        accountStatus.textContent = contentText('messages.account.loggedOut', 'Chưa đăng nhập');
        openAuthButton.hidden = false;
        logoutButton.hidden = true;
        if (profileLoggedOut) profileLoggedOut.hidden = false;
        if (profileLoggedIn) profileLoggedIn.hidden = true;
        if (profileForm) profileForm.hidden = false;
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
    if (profileLoggedOut) profileLoggedOut.hidden = true;
    if (profileLoggedIn) profileLoggedIn.hidden = false;
    if (profileForm) profileForm.hidden = false;
    profileFullName.value = currentUser.fullName || '';
    profilePhone.value = currentUser.phone || '';
    profileAddress.value = currentUser.address || '';
    updateProfileSummary();
    switchProfileTab('info');
    orderHistoryPanel.hidden = false;
    startUserOrderNotifications();
    adminPanel.hidden = currentUser.role !== 'Admin';
    if (currentUser.role === 'Admin') {
        renderAdminStats();
        startAdminOrderNotifications();
    } else {
        stopAdminOrderNotifications();
    }
}

function updateProfileSummary() {
    const displayName = currentUser?.fullName || currentUser?.username || '';
    if (profileDisplayName) profileDisplayName.textContent = displayName || 'User';
    if (profileAvatarLetter) profileAvatarLetter.textContent = (displayName || 'U').trim().charAt(0).toUpperCase();
    if (profileRoleBadge) {
        profileRoleBadge.classList.toggle('admin', currentUser?.role === 'Admin');
        profileRoleBadge.classList.toggle('user', currentUser?.role !== 'Admin');
        profileRoleBadge.innerHTML = `<i class="bi ${currentUser?.role === 'Admin' ? 'bi-shield-check' : 'bi-person-fill'}"></i> ${escapeHtml(currentUser?.role || 'User')}`;
    }
}

function switchAdminTab(tab) {
    const normalizedTab = tab || 'products';
    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
        button.classList.toggle('active', button.dataset.adminTab === normalizedTab);
    });

    document.querySelectorAll('.admin-tab-content').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `adminTab${capitalize(normalizedTab)}`);
    });

    if (normalizedTab === 'orders') {
        loadAdminOrders();
    }
}

function switchDetailTab(tab) {
    const normalizedTab = tab || 'description';
    document.querySelectorAll('[data-detail-tab]').forEach((button) => {
        button.classList.toggle('active', button.dataset.detailTab === normalizedTab);
    });

    document.querySelectorAll('.detail-tab-pane').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `detailTab${capitalize(normalizedTab)}`);
    });
}

function renderAdminStats(orders = null) {
    if (statProductCount) statProductCount.textContent = products.length;

    if (!orders) return;

    const revenue = orders.reduce((sum, order) => sum + (Number(order.amount) || 0), 0);
    if (statOrderCount) statOrderCount.textContent = orders.length;
    if (statRevenue) statRevenue.textContent = currency.format(revenue);
}

function updateAdminImagePreview() {
    if (!adminImagePreview) return;
    const image = document.getElementById('adminImage').value.trim();

    adminImagePreview.innerHTML = image
        ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(contentText('labels.imagePreview', 'Xem trước ảnh'))}" loading="lazy" decoding="async">`
        : `
            <div class="placeholder-icon">
                <i class="bi bi-image"></i>
                <small>${escapeHtml(contentText('labels.imagePreview', 'Xem trước ảnh'))}</small>
            </div>
        `;
}

async function loadOrderHistory() {
    if (!currentUser?.token) return;

    orderHistoryMessage.textContent = contentText('messages.orders.loading', 'Đang tải đơn hàng...');

    try {
        const response = await fetch('/api/orders/me', {
            headers: authHeaders(false)
        });
        const data = await response.json();

        if (!response.ok) {
            orderHistoryMessage.textContent = data.message || contentText('messages.orders.loadFailed', 'Không tải được lịch sử đơn hàng.');
            return;
        }

        const fetchedOrders = Array.isArray(data.orders) ? data.orders : [];
        const ordersById = new Map(fetchedOrders.map((order) => [Number(order.id), order]));
        userOrders.forEach((existingOrder) => {
            const fetchedOrder = ordersById.get(Number(existingOrder.id));
            if (!fetchedOrder || getOrderUpdatedTime(existingOrder) > getOrderUpdatedTime(fetchedOrder)) {
                ordersById.set(Number(existingOrder.id), existingOrder);
            }
        });
        userOrders = Array.from(ordersById.values())
            .sort((a, b) => Number(b.id) - Number(a.id));
        renderOrderHistory(userOrders);
        return userOrders;
    } catch {
        orderHistoryMessage.textContent = contentText('messages.common.serverDisconnected', 'Không kết nối được server.');
        return null;
    }
}

function renderOrderHistory(orders) {
    if (!orders.length) {
        orderHistoryList.innerHTML = `<p class="empty-cart">${escapeHtml(contentText('messages.orders.empty', 'Chưa có đơn hàng.'))}</p>`;
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
        const fulfillmentStatus = normalizeOrderFulfillmentStatus(order.fulfillmentStatus);
        const receivedButton = fulfillmentStatus === 'SHIPPING'
            ? `<button type="button" class="order-received-button" data-order-received="${Number(order.id)}">
                <i class="bi bi-box2-heart"></i> Xác nhận đã nhận hàng
               </button>`
            : '';

        return `
            <article class="order-history-card">
                <header>
                    <div>
                        <h4>${escapeHtml(order.orderId || '')}</h4>
                        <small>${escapeHtml(order.provider || '')} ${createdAt ? `- ${escapeHtml(createdAt)}` : ''}</small>
                    </div>
                    <span class="order-status">${escapeHtml(getOrderFulfillmentLabel(fulfillmentStatus))}</span>
                </header>
                ${renderOrderFulfillmentProgress(fulfillmentStatus)}
                <ul>${itemRows}</ul>
                <footer>
                    <span>${escapeHtml(contentTemplate('labels.itemCount', { count: items.length }, '{count} mặt hàng'))}</span>
                    <strong>${currency.format(Number(order.amount) || 0)}</strong>
                </footer>
                ${receivedButton}
            </article>
        `;
    }).join('');
    orderHistoryMessage.textContent = '';
}

function renderOrderFulfillmentProgress(status) {
    const currentIndex = ORDER_FULFILLMENT_STEPS.findIndex((step) => step.value === status);

    return `
        <div class="order-progress" aria-label="Tiến trình đơn hàng">
            ${ORDER_FULFILLMENT_STEPS.map((step, index) => {
                const stateClass = index < currentIndex
                    ? 'completed'
                    : index === currentIndex
                        ? 'active'
                        : '';
                return `
                    <div class="order-progress-step ${stateClass}">
                        <span>${index < currentIndex ? '<i class="bi bi-check-lg"></i>' : index + 1}</span>
                        <small>${escapeHtml(step.label)}</small>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function normalizeOrderFulfillmentStatus(value) {
    const normalized = String(value || 'ORDERED').trim().toUpperCase();
    return ORDER_FULFILLMENT_STEPS.some((step) => step.value === normalized)
        ? normalized
        : 'ORDERED';
}

function getOrderFulfillmentLabel(status) {
    return ORDER_FULFILLMENT_STEPS.find((step) => step.value === status)?.label || 'Đã đặt hàng';
}

function getOrderUpdatedTime(order) {
    const time = new Date(order?.updatedAt || order?.createdAt || 0).getTime();
    return Number.isFinite(time) ? time : 0;
}

async function startUserOrderNotifications() {
    stopUserOrderNotifications();
    const generation = userOrderStreamGeneration;

    connectUserOrderStream(generation);
    await loadOrderHistory();
}

function stopUserOrderNotifications() {
    userOrderStreamGeneration += 1;

    if (userOrderStreamController) {
        userOrderStreamController.abort();
        userOrderStreamController = null;
    }

    if (userOrderStreamReconnectTimer) {
        window.clearTimeout(userOrderStreamReconnectTimer);
        userOrderStreamReconnectTimer = null;
    }

    userOrders = [];
}

async function connectUserOrderStream(generation) {
    if (generation !== userOrderStreamGeneration || !currentUser?.token) return;

    const controller = new AbortController();
    userOrderStreamController = controller;

    try {
        const response = await fetch('/api/orders/me/events', {
            headers: authHeaders(false),
            cache: 'no-store',
            signal: controller.signal
        });

        if (!response.ok || !response.body) {
            throw new Error('Khong mo duoc ket noi trang thai don hang');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (generation === userOrderStreamGeneration) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            buffer = consumeUserOrderEvents(buffer);
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
    } finally {
        if (userOrderStreamController === controller) {
            userOrderStreamController = null;
        }
    }

    if (generation === userOrderStreamGeneration && currentUser?.token) {
        userOrderStreamReconnectTimer = window.setTimeout(() => {
            connectUserOrderStream(generation);
        }, ADMIN_ORDER_STREAM_RECONNECT_MS);
    }
}

function consumeUserOrderEvents(buffer) {
    let boundary = findEventBoundary(buffer);

    while (boundary) {
        const rawEvent = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        handleUserOrderEvent(rawEvent);
        boundary = findEventBoundary(buffer);
    }

    return buffer;
}

function handleUserOrderEvent(rawEvent) {
    const { eventName, payload } = parseServerSentEvent(rawEvent);
    if (eventName !== 'order.fulfillment_changed' || !payload) return;

    userOrders = userOrders.map((order) => {
        if (Number(order.id) !== Number(payload.id)) return order;
        return {
            ...order,
            fulfillmentStatus: payload.fulfillmentStatus,
            receivedAt: payload.receivedAt || null,
            updatedAt: payload.updatedAt || order.updatedAt
        };
    });
    renderOrderHistory(userOrders);
    if (payload.actor !== 'customer') {
        showToast(
            `Đơn ${payload.orderId}: ${getOrderFulfillmentLabel(normalizeOrderFulfillmentStatus(payload.fulfillmentStatus))}`,
            'info',
            5000
        );
    }
}

async function confirmUserOrderReceived(orderId) {
    if (!currentUser?.token || !orderId) return;
    if (!confirm('Xác nhận bạn đã nhận được đơn hàng này?')) return;

    const button = document.querySelector(`[data-order-received="${orderId}"]`);
    if (button) button.disabled = true;

    try {
        const response = await fetch(`/api/orders/${orderId}/received`, {
            method: 'POST',
            headers: authHeaders(false)
        });
        const data = await response.json();

        if (!response.ok || !data.order) {
            showToast(data.message || 'Không thể xác nhận đã nhận hàng.', 'error');
            if (button) button.disabled = false;
            return;
        }

        userOrders = userOrders.map((order) => {
            return Number(order.id) === Number(orderId) ? data.order : order;
        });
        renderOrderHistory(userOrders);
        showToast('Đã xác nhận nhận hàng.', 'success');
    } catch {
        showToast('Không kết nối được server.', 'error');
        if (button) button.disabled = false;
    }
}

async function loadAdminOrders() {
    if (!currentUser?.token || currentUser.role !== 'Admin') return null;

    adminOrdersMessage.textContent = contentText('messages.orders.loading', 'Đang tải đơn hàng...');

    try {
        const response = await fetch('/api/orders', {
            headers: authHeaders(false)
        });
        const data = await response.json();

        if (!response.ok) {
            adminOrdersMessage.textContent = data.message || contentText('messages.adminOrders.loadFailed', 'Không tải được lịch sử bán hàng.');
            return null;
        }

        const fetchedOrders = Array.isArray(data.orders) ? data.orders : [];
        const realtimeOnlyOrders = adminOrders.filter((existingOrder) => {
            return !fetchedOrders.some((order) => Number(order.id) === Number(existingOrder.id));
        });
        adminOrders = [...realtimeOnlyOrders, ...fetchedOrders]
            .sort((a, b) => Number(b.id) - Number(a.id));
        renderAdminOrders(adminOrders);
        renderAdminStats(adminOrders);
        return adminOrders;
    } catch {
        adminOrdersMessage.textContent = contentText('messages.common.serverDisconnected', 'Không kết nối được server.');
        return null;
    }
}

async function startAdminOrderNotifications() {
    stopAdminOrderNotifications();
    const generation = adminOrderStreamGeneration;

    connectAdminOrderStream(generation);
    await loadAdminOrders();
}

function stopAdminOrderNotifications() {
    adminOrderStreamGeneration += 1;

    if (adminOrderStreamController) {
        adminOrderStreamController.abort();
        adminOrderStreamController = null;
    }

    if (adminOrderStreamReconnectTimer) {
        window.clearTimeout(adminOrderStreamReconnectTimer);
        adminOrderStreamReconnectTimer = null;
    }

    adminOrders = [];
    renderAdminOrderBadge();
}

async function connectAdminOrderStream(generation) {
    if (generation !== adminOrderStreamGeneration || !currentUser?.token || currentUser.role !== 'Admin') return;

    const controller = new AbortController();
    adminOrderStreamController = controller;
    try {
        const response = await fetch('/api/admin/order-events', {
            headers: authHeaders(false),
            cache: 'no-store',
            signal: controller.signal
        });

        if (!response.ok || !response.body) {
            throw new Error('Khong mo duoc ket noi thong bao don hang');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (generation === adminOrderStreamGeneration) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            buffer = consumeAdminOrderEvents(buffer);
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
    } finally {
        if (adminOrderStreamController === controller) {
            adminOrderStreamController = null;
        }
    }

    if (generation === adminOrderStreamGeneration && currentUser?.role === 'Admin') {
        adminOrderStreamReconnectTimer = window.setTimeout(() => {
            connectAdminOrderStream(generation);
        }, ADMIN_ORDER_STREAM_RECONNECT_MS);
    }
}

function consumeAdminOrderEvents(buffer) {
    let boundary = findEventBoundary(buffer);

    while (boundary) {
        const rawEvent = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        handleAdminOrderEvent(rawEvent);
        boundary = findEventBoundary(buffer);
    }

    return buffer;
}

function findEventBoundary(buffer) {
    const unixIndex = buffer.indexOf('\n\n');
    const windowsIndex = buffer.indexOf('\r\n\r\n');
    const matches = [
        unixIndex >= 0 ? { index: unixIndex, length: 2 } : null,
        windowsIndex >= 0 ? { index: windowsIndex, length: 4 } : null
    ].filter(Boolean);

    if (!matches.length) return null;
    return matches.reduce((first, match) => match.index < first.index ? match : first);
}

function handleAdminOrderEvent(rawEvent) {
    const { eventName, payload } = parseServerSentEvent(rawEvent);
    if (!payload) return;

    if (eventName === 'order.created') {
        const exists = adminOrders.some((order) => Number(order.id) === Number(payload.id));
        if (!exists) {
            adminOrders = [payload, ...adminOrders];
        }
        renderAdminOrders(adminOrders);
        renderAdminStats(adminOrders);
        showToast(
            `Có đơn hàng mới ${payload.orderId} - ${currency.format(Number(payload.amount) || 0)}`,
            'info',
            6000
        );
        return;
    }

    if (eventName === 'order.seen') {
        adminOrders = adminOrders.map((order) => {
            if (Number(order.id) !== Number(payload.id)) return order;
            return {
                ...order,
                isNew: false,
                adminSeenAt: payload.adminSeenAt || new Date().toISOString()
            };
        });
        renderAdminOrders(adminOrders);
        return;
    }

    if (eventName === 'order.fulfillment_changed') {
        adminOrders = adminOrders.map((order) => {
            if (Number(order.id) !== Number(payload.id)) return order;
            return {
                ...order,
                fulfillmentStatus: payload.fulfillmentStatus,
                receivedAt: payload.receivedAt || null,
                updatedAt: payload.updatedAt || order.updatedAt
            };
        });
        renderAdminOrders(adminOrders);
    }
}

function parseServerSentEvent(rawEvent) {
    const lines = rawEvent.split(/\r?\n/);
    const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() || 'message';
    const data = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');

    if (!data) return { eventName, payload: null };

    let payload;
    try {
        payload = JSON.parse(data);
    } catch {
        return { eventName, payload: null };
    }

    return { eventName, payload };
}

async function markAdminOrderSeen(orderId) {
    if (!currentUser?.token || currentUser.role !== 'Admin' || !orderId) return;

    const button = document.querySelector(`[data-order-seen="${orderId}"]`);
    if (button) button.disabled = true;

    try {
        const response = await fetch(`/api/orders/${orderId}/seen`, {
            method: 'POST',
            headers: authHeaders(false)
        });
        const data = await response.json();

        if (!response.ok || !data.order) {
            showToast(data.message || 'Không thể xác nhận đơn hàng.', 'error');
            if (button) button.disabled = false;
            return;
        }

        adminOrders = adminOrders.map((order) => {
            return Number(order.id) === Number(orderId) ? data.order : order;
        });
        renderAdminOrders(adminOrders);
    } catch {
        showToast('Không kết nối được server.', 'error');
        if (button) button.disabled = false;
    }
}

async function updateAdminOrderFulfillment(orderId, nextStatus) {
    if (!currentUser?.token || currentUser.role !== 'Admin' || !orderId) return;

    const button = document.querySelector(
        `[data-order-id="${orderId}"][data-order-fulfillment="${nextStatus}"]`
    );
    if (button) button.disabled = true;

    try {
        const response = await fetch(`/api/orders/${orderId}/fulfillment`, {
            method: 'PUT',
            headers: authHeaders(true),
            body: JSON.stringify({ status: nextStatus })
        });
        const data = await response.json();

        if (!response.ok || !data.order) {
            showToast(data.message || 'Không thể cập nhật trạng thái đơn hàng.', 'error');
            if (button) button.disabled = false;
            return;
        }

        adminOrders = adminOrders.map((order) => {
            return Number(order.id) === Number(orderId) ? data.order : order;
        });
        renderAdminOrders(adminOrders);
        showToast(
            `Đã cập nhật: ${getOrderFulfillmentLabel(normalizeOrderFulfillmentStatus(data.order.fulfillmentStatus))}`,
            'success'
        );
    } catch {
        showToast('Không kết nối được server.', 'error');
        if (button) button.disabled = false;
    }
}

function renderAdminOrderBadge() {
    if (!adminNewOrdersBadge) return;

    const unreadCount = adminOrders.filter((order) => order.isNew).length;
    adminNewOrdersBadge.hidden = unreadCount <= 0;
    adminNewOrdersBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
}

function renderAdminOrders(orders) {
    if (!adminOrdersBody) return;

    if (!orders.length) {
        adminOrdersBody.innerHTML = `
            <tr>
                <td colspan="5">${escapeHtml(contentText('messages.orders.empty', 'Chưa có đơn hàng.'))}</td>
            </tr>
        `;
        adminOrdersMessage.textContent = '';
        renderAdminOrderBadge();
        return;
    }

    adminOrdersBody.innerHTML = orders.map((order) => {
        const customer = order.customer || {};
        const customerName = customer.fullName || customer.username || contentText('labels.customer', 'Khách hàng');
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
        const newOrderBadge = order.isNew
            ? '<span class="admin-order-new-badge"><i class="bi bi-bell-fill"></i> Mới</span>'
            : '';
        const seenButton = order.isNew
            ? `<button type="button" class="admin-order-seen-button" data-order-seen="${Number(order.id)}">
                <i class="bi bi-check2-circle"></i> Đã kiểm tra
               </button>`
            : '';
        const fulfillmentStatus = normalizeOrderFulfillmentStatus(order.fulfillmentStatus);
        const fulfillmentAction = getAdminFulfillmentAction(order.id, fulfillmentStatus);

        return `
            <tr class="${order.isNew ? 'admin-order-new' : ''}">
                <td>
                    <div class="admin-order-code">
                        <strong>${escapeHtml(order.orderId || '')}</strong>
                        ${newOrderBadge}
                    </div>
                    <small>${escapeHtml(order.status || '')}</small>
                    ${seenButton}
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
                <td>
                    <div class="admin-fulfillment">
                        <span class="admin-fulfillment-status">${escapeHtml(getOrderFulfillmentLabel(fulfillmentStatus))}</span>
                        ${fulfillmentAction}
                    </div>
                </td>
                <td><strong>${currency.format(Number(order.amount) || 0)}</strong></td>
            </tr>
        `;
    }).join('');
    adminOrdersMessage.textContent = '';
    renderAdminOrderBadge();
}

function getAdminFulfillmentAction(orderId, status) {
    if (status === 'ORDERED') {
        return `
            <button type="button" data-order-id="${Number(orderId)}" data-order-fulfillment="PREPARING">
                <i class="bi bi-box-seam"></i> Xác nhận & chuẩn bị
            </button>
        `;
    }

    if (status === 'PREPARING') {
        return `
            <button type="button" data-order-id="${Number(orderId)}" data-order-fulfillment="SHIPPING">
                <i class="bi bi-truck"></i> Bắt đầu giao hàng
            </button>
        `;
    }

    if (status === 'SHIPPING') {
        return '<small>Chờ người nhận xác nhận</small>';
    }

    return '<small><i class="bi bi-check-circle-fill"></i> Đơn đã hoàn tất</small>';
}

async function submitProfile(event) {
    event.preventDefault();

    if (!currentUser?.token) {
        profileMessage.textContent = contentText('messages.profile.needLogin', 'Vui lòng đăng nhập.');
        showAuthModal();
        return;
    }

    profileMessage.textContent = contentText('messages.profile.saving', 'Đang lưu thông tin...');

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
            profileMessage.textContent = data.message || contentText('messages.profile.saveFailed', 'Không lưu được thông tin.');
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
        profileMessage.textContent = contentText('messages.profile.saved', 'Đã lưu thông tin tài khoản.');
    } catch {
        profileMessage.textContent = contentText('messages.common.serverDisconnected', 'Không kết nối được server.');
    }
}

async function submitAdminProduct(event) {
    event.preventDefault();

    if (!currentUser?.token || currentUser.role !== 'Admin') {
        adminMessage.textContent = contentText('messages.admin.needAdmin', 'Bạn cần đăng nhập Admin.');
        return;
    }

    const id = document.getElementById('adminProductId').value;
    const category = document.getElementById('adminCategory').value;
    const sizes = splitList(document.getElementById('adminSizes').value);
    const stockInput = document.getElementById('adminStock').value;
    const payload = {
        name: document.getElementById('adminName').value,
        category,
        displayCategory: displayCategoryFromType(category),
        price: Number(document.getElementById('adminPrice').value),
        salePercent: Number(document.getElementById('adminSalePercent').value) || 0,
        image: document.getElementById('adminImage').value,
        sizes,
        stock: parseStock(stockInput),
        totalStock: sizes.length ? null : parseTotalStock(stockInput),
        section: document.getElementById('adminSection').value
    };

    const url = id ? `/api/products/${id}` : '/api/products';
    const method = id ? 'PUT' : 'POST';
    adminMessage.textContent = contentText('messages.admin.saving', 'Đang lưu...');

    try {
        const response = await fetch(url, {
            method,
            headers: adminHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (!response.ok) {
            adminMessage.textContent = data.message || contentText('messages.admin.saveFailed', 'Không lưu được sản phẩm.');
            return;
        }

        products = data.products || products;
        syncCartWithProducts();
        renderProducts();
        renderProductDetail();
        renderSearch(searchInput.value);
        renderCart();
        renderAdminProducts();
        resetAdminForm();
        adminMessage.textContent = contentText('messages.admin.saved', 'Đã lưu sản phẩm.');
    } catch {
        adminMessage.textContent = contentText('messages.common.serverDisconnected', 'Không kết nối được server.');
    }
}

function renderAdminProducts() {
    if (!adminProductsBody) return;
    const newSectionLabel = contentText('labels.sections.newProducts', 'Sản phẩm mới');
    const allSectionLabel = contentText('labels.sections.allProducts', 'Tất cả sản phẩm');
    const editLabel = contentText('buttons.edit', 'Sửa');
    const deleteLabel = contentText('buttons.delete', 'Xóa');

    adminProductsBody.innerHTML = products.map((product) => `
        <tr>
            <td>
                <strong>${escapeHtml(product.name)}</strong>
                <small>${escapeHtml(product.section === 'new' ? newSectionLabel : allSectionLabel)}</small>
            </td>
            <td>${escapeHtml(product.displayCategory)}</td>
            <td>${renderPrice(product)}</td>
            <td><span class="sale-pill">${getProductSalePercent(product)}%</span></td>
            <td>${escapeHtml(formatStock(product))}</td>
            <td>
                <div class="admin-row-actions">
                    <button type="button" data-admin-edit="${product.id}">${escapeHtml(editLabel)}</button>
                    <button type="button" data-admin-delete="${product.id}">${escapeHtml(deleteLabel)}</button>
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
    document.getElementById('adminSalePercent').value = getProductSalePercent(product);
    document.getElementById('adminImage').value = product.image;
    document.getElementById('adminSizes').value = getProductSizes(product).join(',');
    document.getElementById('adminStock').value = formatStock(product);
    document.getElementById('adminSection').value = product.section || 'products';
    adminMessage.textContent = contentText('messages.admin.editing', 'Đang sửa sản phẩm.');
    updateAdminImagePreview();
    adminPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteAdminProduct(productId) {
    if (!currentUser?.token || currentUser.role !== 'Admin') return;
    if (!confirm(contentText('messages.admin.deleteConfirm', 'Xóa sản phẩm này?'))) return;

    try {
        const response = await fetch(`/api/products/${productId}`, {
            method: 'DELETE',
            headers: adminHeaders()
        });
        const data = await response.json();

        if (!response.ok) {
            adminMessage.textContent = data.message || contentText('messages.admin.deleteFailed', 'Không xóa được sản phẩm.');
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
        adminMessage.textContent = contentText('messages.admin.deleted', 'Đã xóa sản phẩm.');
    } catch {
        adminMessage.textContent = contentText('messages.common.serverDisconnected', 'Không kết nối được server.');
    }
}

function resetAdminForm() {
    adminProductForm.reset();
    document.getElementById('adminProductId').value = '';
    updateAdminImagePreview();
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

function productFromCard(card, button) {
    if (!card && !button) return null;

    return {
        id: Number(button?.dataset.productId || card?.dataset.productId || Date.now()),
        name: button?.dataset.name || card?.dataset.name || contentText('labels.productFallback', 'Sản phẩm'),
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
    if (!requiresSize(product)) {
        const totalStock = getProductTotalStock(product);
        return totalStock === null || currentQuantity + 1 <= totalStock;
    }

    if (!size) return false;
    const stock = Number(product.stock?.[String(size)] || 0);
    return currentQuantity + 1 <= stock;
}

function getProductSizes(product) {
    return Array.isArray(product.sizes) ? product.sizes.map((size) => String(size)) : [];
}

function getProductTotalStock(product) {
    if (product.totalStock === null || product.totalStock === undefined || product.totalStock === '') {
        return null;
    }

    const totalStock = Number(product.totalStock);
    return Number.isFinite(totalStock) ? Math.max(0, totalStock) : null;
}

function getProductBasePrice(product) {
    return Math.max(0, Number(product?.price) || 0);
}

function getProductSalePercent(product) {
    const salePercent = Number(product?.salePercent) || 0;
    if (!Number.isFinite(salePercent)) return 0;
    return Math.min(95, Math.max(0, Math.trunc(salePercent)));
}

function getProductSalePrice(product) {
    const basePrice = getProductBasePrice(product);
    const salePercent = getProductSalePercent(product);
    if (!salePercent) return basePrice;
    return Math.max(0, Math.round(basePrice * (100 - salePercent) / 100));
}

function renderPrice(product) {
    const salePercent = getProductSalePercent(product);
    const basePrice = getProductBasePrice(product);
    const salePrice = getProductSalePrice(product);

    if (!salePercent) {
        return `<strong>${currency.format(basePrice)}</strong>`;
    }

    return `
        <div class="price-stack">
            <strong>${currency.format(salePrice)}</strong>
            <del>${currency.format(basePrice)}</del>
        </div>
    `;
}

function clampQuantity(product, quantity) {
    const totalStock = getProductTotalStock(product);
    return totalStock === null ? quantity : Math.min(quantity, totalStock);
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

function getProductDescription(product) {
    if (product?.description) return String(product.description);

    const category = product?.displayCategory || 'sản phẩm';
    const sizeInfo = getProductSizes(product).length
        ? `Có các size ${getProductSizes(product).join(', ')}.`
        : 'Phù hợp dùng hằng ngày, dễ phối với nhiều outfit.';

    return `${product?.name || 'Sản phẩm'} thuộc nhóm ${category}, được kiểm tra tồn kho và tình trạng trước khi giao. ${sizeInfo}`;
}

function getStockSummary(product) {
    if (requiresSize(product)) {
        const available = getProductSizes(product)
            .map((size) => `${size}: ${Number(product.stock?.[String(size)] || 0)}`)
            .join(', ');
        return available
            ? `${contentText('labels.stock', 'Tồn kho')}: ${available}`
            : contentText('messages.cart.sizeSoldOut', 'Size này tạm hết hàng');
    }

    const totalStock = getProductTotalStock(product);
    if (totalStock === null) return contentText('labels.stockUnlimited', 'Không giới hạn');
    return `${contentText('labels.stock', 'Tồn kho')}: ${totalStock}`;
}

function isProductOutOfStock(product) {
    if (requiresSize(product)) {
        return getProductSizes(product).every((size) => Number(product.stock?.[String(size)] || 0) <= 0);
    }

    const totalStock = getProductTotalStock(product);
    return totalStock !== null && totalStock <= 0;
}

function capitalize(value) {
    const text = String(value || '');
    return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '';
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

function parseTotalStock(value) {
    const totalStock = Number(String(value || '').trim());
    return Number.isFinite(totalStock) ? Math.max(0, Math.trunc(totalStock)) : null;
}

function formatStock(product) {
    const sizes = getProductSizes(product);
    if (!sizes.length) {
        const totalStock = getProductTotalStock(product);
        return totalStock === null ? contentText('labels.stockUnlimited', 'Không giới hạn') : String(totalStock);
    }

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
