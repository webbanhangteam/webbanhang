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
const CANCELLED_FULFILLMENT_STATUS = 'CANCELLED';
const VIETQR_WAITING_CONFIRMATION_STATUS = 'VIETQR_WAITING_CONFIRMATION';
const SEARCH_CATEGORY_TERMS = {
    shoes: ['giày', 'giày dép', 'giày thể thao', 'sneaker', 'shoe', 'shoes', 'footwear'],
    clothing: ['quần áo', 'áo', 'quần', 'thời trang', 'đồ mặc', 'clothing', 'clothes', 'apparel'],
    accessory: ['phụ kiện', 'accessory', 'accessories']
};
const SEARCH_PRODUCT_GROUPS = [
    ['air force', 'af1'],
    ['dunk', 'panda'],
    ['jordan', 'aj1'],
    ['new balance', 'nb', '550'],
    ['áo đấu', 'jersey', 'bóng đá', 'football shirt'],
    ['áo thun', 'tee', 't shirt', 't-shirt'],
    ['túi', 'bag', 'đeo chéo', 'sling bag'],
    ['mũ', 'nón', 'cap', 'hat']
];
const SEARCH_COLOR_GROUPS = [
    ['trắng', 'white'],
    ['đen', 'black'],
    ['đỏ', 'red'],
    ['xám', 'ghi', 'gray', 'grey'],
    ['kem', 'cream', 'beige'],
    ['xanh dương', 'xanh biển', 'blue'],
    ['xanh lá', 'green'],
    ['vàng', 'yellow'],
    ['nâu', 'brown'],
    ['hồng', 'pink'],
    ['tím', 'purple', 'violet'],
    ['cam', 'orange']
];

let currentUser = normalizeSession(loadJson(SESSION_KEY, null));
let products = [];
let cart = loadCart();
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
let adminReturnRequests = [];
let adminRevenueSummary = null;
let currentReviewData = null;
let notifications = [];
let vietQrPaymentPollTimer = null;
let vietQrPaymentPollOrderId = null;
let cartSyncTimer = null;

const cartCount = document.getElementById('cartCount');
const cartItems = document.getElementById('cartItems');
const subtotal = document.getElementById('subtotal');
const checkoutMessage = document.getElementById('checkoutMessage');
let vietQrPaymentPanel = document.getElementById('vietQrPaymentPanel');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const searchForm = document.getElementById('searchForm');
const searchPageForm = document.getElementById('searchPageForm');
const searchPageInput = document.getElementById('searchPageInput');
const searchPageCategory = document.getElementById('searchPageCategory');
const searchPageColor = document.getElementById('searchPageColor');
const searchPageGrid = document.getElementById('searchPageGrid');
const searchPageSummary = document.getElementById('searchPageSummary');
const searchPageTitle = document.getElementById('searchPageTitle');
const clearSearchFiltersButton = document.getElementById('clearSearchFilters');
const productGrid = document.getElementById('productGrid');
const secondaryProducts = document.querySelector('.secondary-products');
const accountButton = document.getElementById('accountButton');
const adminPageLinks = document.querySelectorAll('[data-admin-page-link]');
const openAuthButton = document.getElementById('openAuthButton');
const logoutButton = document.getElementById('logoutButton');
const accountStatus = document.getElementById('accountStatus');
const profileForm = document.getElementById('profileForm');
const profileFullName = document.getElementById('profileFullName');
const profilePhone = document.getElementById('profilePhone');
const profileProvince = document.getElementById('province');
const profileWard = document.getElementById('ward');
const profileStreetAddress = document.getElementById('streetAddress');
const profileMessage = document.getElementById('profileMessage');
const orderHistoryPanel = document.getElementById('orderHistoryPanel');
const orderHistoryList = document.getElementById('orderHistoryList');
const orderHistoryMessage = document.getElementById('orderHistoryMessage');
const refreshOrdersButton = document.getElementById('refreshOrdersButton');
const returnsLoggedOut = document.getElementById('returnsLoggedOut');
const returnsPanel = document.getElementById('returnsPanel');
const returnOrdersList = document.getElementById('returnOrdersList');
const returnOrdersMessage = document.getElementById('returnOrdersMessage');
const refreshReturnOrdersButton = document.getElementById('refreshReturnOrdersButton');
const returnRequestForm = document.getElementById('returnRequestForm');
const returnOrderSelect = document.getElementById('returnOrderSelect');
const returnRequestType = document.getElementById('returnRequestType');
const returnReason = document.getElementById('returnReason');
const returnSelectedOrderSummary = document.getElementById('returnSelectedOrderSummary');
const submitReturnRequestButton = document.getElementById('submitReturnRequestButton');
const returnsMessage = document.getElementById('returnsMessage');
const adminPanel = document.getElementById('adminPanel');
const adminAccessMessage = document.getElementById('adminAccessMessage');
const adminProductForm = document.getElementById('adminProductForm');
const adminProductsBody = document.getElementById('adminProductsBody');
const adminMessage = document.getElementById('adminMessage');
const adminOrdersBody = document.getElementById('adminOrdersBody');
const adminOrdersMessage = document.getElementById('adminOrdersMessage');
const refreshAdminOrdersButton = document.getElementById('refreshAdminOrdersButton');
const adminReturnRequestsBody = document.getElementById('adminReturnRequestsBody');
const adminReturnRequestsMessage = document.getElementById('adminReturnRequestsMessage');
const refreshAdminReturnRequestsButton = document.getElementById('refreshAdminReturnRequestsButton');
const adminRevenueBreakdown = document.getElementById('adminRevenueBreakdown');
const adminNewOrdersBadge = document.getElementById('adminNewOrdersBadge');
const notificationLoggedOut = document.getElementById('notificationLoggedOut');
const notificationPanel = document.getElementById('notificationPanel');
const notificationList = document.getElementById('notificationList');
const notificationMessage = document.getElementById('notificationMessage');
const notificationAudience = document.getElementById('notificationAudience');
const refreshNotificationsButton = document.getElementById('refreshNotificationsButton');
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
const detailReviewsPane = document.getElementById('detailTabReviews');
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
    const requestedProductId = Number(new URLSearchParams(window.location.search).get('id'));
    if (Number.isInteger(requestedProductId) && requestedProductId > 0) {
        currentDetailProductId = requestedProductId;
    }
    syncCartWithProducts();
    renderProducts();
    renderProductDetail();
    if (new URLSearchParams(window.location.search).get('review')) {
        switchDetailTab('reviews');
    }
    renderCart();
    renderSearch(searchInput?.value || '');
    await initSearchPage();
    updateAccountUi();
    renderAdminProducts();
    await handlePaymentReturnNotice();
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
    const isHomePage = ['/', '/index.html', '/html/index.html'].includes(window.location.pathname);
    if (title && isHomePage) document.title = title;

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
    document.addEventListener('submit', handleDocumentSubmit);
    document.addEventListener('change', handleDocumentChange);

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderSearch(searchInput.value);
        });
    }

    if (searchForm) {
        searchForm.addEventListener('submit', (event) => {
            event.preventDefault();
            window.location.href = buildSearchUrl({ query: searchInput?.value });
        });
    }

    if (searchPageForm) {
        searchPageForm.addEventListener('submit', (event) => {
            event.preventDefault();
            updateSearchPage();
        });
    }

    [searchPageCategory, searchPageColor].filter(Boolean).forEach((select) => {
        select.addEventListener('change', updateSearchPage);
    });

    clearSearchFiltersButton?.addEventListener('click', () => {
        if (searchPageInput) searchPageInput.value = '';
        if (searchPageCategory) searchPageCategory.value = '';
        if (searchPageColor) searchPageColor.value = '';
        updateSearchPage();
    });

    const searchModal = document.getElementById('searchModal');
    if (searchModal) {
        searchModal.addEventListener('shown.bs.modal', () => {
            searchInput?.focus();
            renderSearch(searchInput?.value || '');
        });
    }

    document.getElementById('payosCheckout')?.addEventListener('click', () => {
        startPayOsCheckout();
    });

    document.getElementById('vietQrCheckout')?.addEventListener('click', () => {
        startPayOsCheckout();
    });

    document.getElementById('codCheckout')?.addEventListener('click', () => {
        startCodCheckout();
    });

    if (refreshNotificationsButton) {
        refreshNotificationsButton.addEventListener('click', () => {
            loadNotifications();
        });
    }

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

    openAuthButton?.addEventListener('click', showAuthModal);

    accountButton?.addEventListener('click', (event) => {
        if (!currentUser?.token && accountButton.getAttribute('href')?.startsWith('#')) {
            if (authModal) {
                event.preventDefault();
                showAuthModal();
            }
        }
    });

    logoutButton?.addEventListener('click', async () => {
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

    if (refreshReturnOrdersButton) {
        refreshReturnOrdersButton.addEventListener('click', () => {
            loadReturnOrdersPage();
        });
    }

    if (returnRequestForm) {
        returnRequestForm.addEventListener('submit', submitReturnRequestForm);
    }

    if (returnOrderSelect) {
        returnOrderSelect.addEventListener('change', () => {
            renderReturnSelectedOrderSummary();
        });
    }

    if (refreshAdminOrdersButton) {
        refreshAdminOrdersButton.addEventListener('click', () => {
            loadAdminOrders();
        });
    }

    if (refreshAdminReturnRequestsButton) {
        refreshAdminReturnRequestsButton.addEventListener('click', () => {
            loadAdminReturnRequests();
        });
    }

    ensureAdminVariantPricesField();

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

    ensureDetailReviewsTab();
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
        await loadCartForCurrentUser();
    } catch {
        clearSession();
    }
}

async function logout() {
    if (currentUser?.token) {
        if (cartSyncTimer) {
            window.clearTimeout(cartSyncTimer);
            cartSyncTimer = null;
            await persistCartToServer();
        }

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
    if (cartSyncTimer) {
        window.clearTimeout(cartSyncTimer);
        cartSyncTimer = null;
    }
    localStorage.removeItem(SESSION_KEY);
    currentUser = null;
    loadCartForCurrentUser();
}

function handleDocumentClick(event) {
    const vietQrCloseButton = event.target.closest('[data-vietqr-close]');
    if (vietQrCloseButton) {
        resetVietQrPanel();
        return;
    }

    const vietQrRestoreButton = event.target.closest('[data-vietqr-restore]');
    if (vietQrRestoreButton) {
        restoreVietQrPayment(Number(vietQrRestoreButton.dataset.vietqrRestore), vietQrRestoreButton);
        return;
    }

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

    const colorButton = event.target.closest('.color-list button');
    if (colorButton) {
        if (colorButton.disabled) return;
        colorButton.closest('.color-list')?.querySelectorAll('button').forEach((button) => {
            button.classList.remove('selected');
        });
        colorButton.classList.add('selected');
        const product = products.find((item) => Number(item.id) === Number(currentDetailProductId));
        if (product) updateDetailVariantState(product);
        return;
    }

    const sizeButton = event.target.closest('.size-list button');
    if (sizeButton) {
        if (sizeButton.disabled) return;
        sizeButton.closest('.size-list')?.querySelectorAll('button').forEach((button) => {
            button.classList.remove('selected');
        });
        sizeButton.classList.add('selected');
        const product = products.find((item) => Number(item.id) === Number(currentDetailProductId));
        if (product) updateDetailVariantState(product);
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
        return;
    }

    const returnButton = event.target.closest('[data-order-return]');
    if (returnButton) {
        requestOrderReturn(Number(returnButton.dataset.orderReturn));
        return;
    }

    const returnOrderSelectButton = event.target.closest('[data-return-order-select]');
    if (returnOrderSelectButton) {
        selectReturnOrderForRequest(Number(returnOrderSelectButton.dataset.returnOrderSelect));
        return;
    }

    const cancelOrderButton = event.target.closest('[data-order-cancel]');
    if (cancelOrderButton) {
        cancelOrderFromUi(
            Number(cancelOrderButton.dataset.orderCancel),
            cancelOrderButton.dataset.cancelActor || 'customer'
        );
        return;
    }

    const refundOrderButton = event.target.closest('[data-order-refund]');
    if (refundOrderButton) {
        refundOrderFromUi(Number(refundOrderButton.dataset.orderRefund));
        return;
    }

    const returnStatusButton = event.target.closest('[data-return-status]');
    if (returnStatusButton) {
        updateAdminReturnRequest(
            Number(returnStatusButton.dataset.returnRequestId),
            returnStatusButton.dataset.returnStatus
        );
    }
}

function ensureDetailReviewsTab() {
    if (!detailReviewsPane || document.querySelector('[data-detail-tab="reviews"]')) return;

    const nav = document.querySelector('.detail-tabs-nav');
    const policyButton = nav?.querySelector('[data-detail-tab="policy"]');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.detailTab = 'reviews';
    button.textContent = 'Đánh giá';

    if (policyButton) {
        nav.insertBefore(button, policyButton);
    } else {
        nav?.appendChild(button);
    }
}

function ensureAdminVariantPricesField() {
    if (!adminProductForm || document.getElementById('adminVariantPrices')) return;

    const adminSection = document.getElementById('adminSection');
    const anchor = adminSection?.closest('label') || adminProductForm.querySelector('.admin-actions');
    const label = document.createElement('label');
    label.className = 'full-width';
    label.innerHTML = `
        Giá từng biến thể
        <textarea id="adminVariantPrices" rows="5" placeholder="Trắng|39:2890000, Trắng|40:2990000, Đen|39:3090000"></textarea>
        <small>Dùng định dạng Màu|Size:Giá. Để trống nếu mỗi biến thể dùng giá chung.</small>
    `;

    if (anchor) {
        adminProductForm.insertBefore(label, anchor);
    } else {
        adminProductForm.appendChild(label);
    }
}

function handleDocumentSubmit(event) {
    const reviewForm = event.target.closest('#detailReviewForm');
    if (reviewForm) {
        event.preventDefault();
        submitProductReview(reviewForm);
    }
}

function handleDocumentChange(event) {
    const variantSelect = event.target.closest('.product-size-select, .product-color-select');
    if (variantSelect) {
        const card = variantSelect.closest('[data-product-id]');
        updateProductCardVariantPrice(card);
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
        let color = item.color ? String(item.color) : '';
        const colors = getProductColors(product);
        if (!color && colors.length === 1) {
            [color] = colors;
        }

        if (colors.length && (!color || !colors.includes(color))) {
            return null;
        }

        if (requiresSize(product)) {
            const sizes = getProductSizes(product);
            const stock = getVariantStock(product, color, size);

            if (!size || !sizes.includes(size) || stock <= 0) {
                return null;
            }

            return {
                productId: Number(product.id),
                name: product.name,
                size,
                color: color || null,
                quantity: Math.min(Number(item.quantity) || 1, stock),
                price: getProductSalePrice(product, color, size)
            };
        }

        const stock = getVariantStock(product, color, '');
        return {
            productId: Number(product.id),
            name: product.name,
            size: null,
            color: color || null,
            quantity: colors.length
                ? Math.min(Math.max(1, Number(item.quantity) || 1), stock)
                : clampQuantity(product, Math.max(1, Number(item.quantity) || 1)),
            price: getProductSalePrice(product, color, '')
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
    const colors = getProductColors(product);
    const primaryImage = getProductImages(product)[0];
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
    const chooseSize = contentText('labels.chooseSize', 'Chọn kích cỡ');
    const soldOut = contentText('labels.soldOut', 'hết hàng');
    const sizeSelect = sizes.length ? `
        <select class="product-size-select" data-size-for="${product.id}" aria-label="${escapeAttr(contentTemplate('labels.chooseSizeFor', { name: product.name }, 'Chọn kích cỡ cho {name}'))}">
            <option value="">${escapeHtml(chooseSize)}</option>
            ${sizes.map((size) => {
        const qty = getSizeTotalStock(product, size);
        const disabled = qty <= 0 ? ' disabled' : '';
        const label = qty <= 0 ? `${size} - ${soldOut}` : `${size} (${qty})`;
        return `<option value="${escapeAttr(size)}"${disabled}>${escapeHtml(label)}</option>`;
    }).join('')}
        </select>
    ` : '';
    const colorSelect = colors.length ? `
        <select class="product-color-select" data-color-for="${product.id}" aria-label="Chọn màu cho ${escapeAttr(product.name)}">
            <option value="">Chọn màu</option>
            ${colors.map((color) => {
        const qty = getColorTotalStock(product, color);
        const disabled = qty <= 0 ? ' disabled' : '';
        const label = qty <= 0 ? `${color} - hết hàng` : `${color} (${qty})`;
        return `<option value="${escapeAttr(color)}"${disabled}>${escapeHtml(label)}</option>`;
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
                <a class="product-media block overflow-hidden bg-gray-100" href="/product.html?id=${product.id}">
                    <img class="w-full object-cover transition-transform duration-300" src="${escapeAttr(primaryImage)}" alt="${escapeAttr(product.name)}" loading="lazy">
                    <span class="product-hover-detail">
                        <strong>${escapeHtml(contentText('labels.productDetail', 'Chi tiết sản phẩm'))}</strong>
                        <small>${escapeHtml(getProductDescription(product))}</small>
                        <small>${escapeHtml(getStockSummary(product))}</small>
                    </span>
                </a>
                <div class="product-info p-4">
                    <span class="text-xs font-extrabold uppercase text-rose-600">${escapeHtml(product.displayCategory)}</span>
                    <h3 class="text-base font-extrabold leading-snug">${escapeHtml(product.name)}</h3>
                    ${colorSelect}
                    ${sizeSelect}
                    <div class="product-bottom">
                        <div class="product-card-price" data-card-price-for="${product.id}">${priceHtml}</div>
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
    if (window.location.pathname.endsWith('/product.html')) {
        document.title = `${product.name} | Shop Anh Thuận`;
    }

    const detailCard = document.querySelector('.detail-card');
    const detailButton = document.querySelector('.add-detail-cart');
    const sizeList = document.querySelector('.detail-card .size-list');
    const colorList = document.querySelector('.detail-card .color-list');
    const title = document.querySelector('.detail-card h2');
    const price = document.querySelector('.detail-price');
    const desc = document.querySelector('.detail-desc');
    const gallery = document.querySelector('.detail-gallery');
    const outOfStock = isProductOutOfStock(product);

    if (title) title.textContent = product.name;
    if (price) price.innerHTML = renderPrice(product);
    if (desc) desc.textContent = getProductDescription(product);
    if (detailBreadcrumbName) detailBreadcrumbName.textContent = product.name;
    if (detailCategoryBadge) detailCategoryBadge.textContent = product.displayCategory || 'Bán chạy';
    if (gallery) renderDetailGallery(gallery, product);
    renderDetailDescription(product);
    renderRelatedProducts(product);
    loadProductReviews(product.id);

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

    if (colorList) {
        const colors = getProductColors(product);
        const optionGroup = colorList.closest('.detail-option-group');
        if (optionGroup) optionGroup.hidden = !colors.length;
        colorList.innerHTML = colors.map((color) => {
            const stock = getColorTotalStock(product, color);
            return `<button type="button" data-color="${escapeAttr(color)}"${stock <= 0 ? ' disabled' : ''}>${escapeHtml(color)}</button>`;
        }).join('');
    }

    if (sizeList) {
        const optionGroup = sizeList.closest('.detail-option-group');
        if (optionGroup) optionGroup.hidden = !getProductSizes(product).length;
    }

    selectFirstAvailableVariant(product);
    renderVariantInventory(product);
    updateDetailVariantState(product);
}

function selectFirstAvailableVariant(product) {
    const colors = getProductColors(product);
    const sizes = getProductSizes(product);
    const colorButtons = Array.from(document.querySelectorAll('.detail-card .color-list button'));
    const sizeButtons = Array.from(document.querySelectorAll('.detail-card .size-list button'));
    colorButtons.forEach((button) => button.classList.remove('selected'));
    sizeButtons.forEach((button) => button.classList.remove('selected'));

    for (const color of colors.length ? colors : ['']) {
        for (const size of sizes.length ? sizes : ['']) {
            if (getVariantStock(product, color, size) <= 0) continue;
            colorButtons.find((button) => button.dataset.color === color)?.classList.add('selected');
            sizeButtons.find((button) => button.dataset.size === size)?.classList.add('selected');
            return;
        }
    }
}

function updateDetailVariantState(product) {
    const selectedColor = document.querySelector('.detail-card .color-list button.selected')?.dataset.color || '';
    const selectedSize = document.querySelector('.detail-card .size-list button.selected')?.dataset.size || '';
    const stock = getVariantStock(product, selectedColor, selectedSize);
    const status = document.getElementById('detailVariantStatus');
    const detailButton = document.querySelector('.add-detail-cart');
    const detailCard = document.querySelector('.detail-card');
    const price = document.querySelector('.detail-price');
    const selectionComplete = (!getProductColors(product).length || selectedColor) &&
        (!getProductSizes(product).length || selectedSize);
    const selectedPrice = getProductSalePrice(product, selectedColor, selectedSize);

    if (price) price.innerHTML = renderPrice(product, selectedColor, selectedSize);
    if (detailCard) detailCard.dataset.price = selectedPrice;

    if (status) {
        status.textContent = selectionComplete
            ? (stock > 0 ? `Còn ${stock} sản phẩm cho lựa chọn này` : 'Biến thể này đã hết hàng')
            : 'Chọn đầy đủ màu và kích cỡ để xem tồn kho';
        status.classList.toggle('sold-out', selectionComplete && stock <= 0);
    }

    if (detailButton) {
        detailButton.disabled = !selectionComplete || stock <= 0;
        detailButton.dataset.price = selectedPrice;
    }

    document.querySelectorAll('.detail-card .size-list button').forEach((button) => {
        const size = button.dataset.size || '';
        button.disabled = getVariantStock(product, selectedColor, size) <= 0;
    });
}

function renderVariantInventory(product) {
    const container = document.getElementById('variantInventory');
    if (!container) return;

    const colors = getProductColors(product);
    const sizes = getProductSizes(product);
    const colorValues = colors.length ? colors : ['Không phân màu'];
    const sizeValues = sizes.length ? sizes : ['—'];

    container.innerHTML = `
        <div class="variant-stock-head">
            <strong>Tồn kho theo biến thể</strong>
            <span>${colorValues.length * sizeValues.length} loại</span>
        </div>
        <div class="variant-stock-table-wrap">
            <table class="variant-stock-table">
                <thead><tr><th>Màu</th><th>Kích cỡ</th><th>Số lượng</th></tr></thead>
                <tbody>
                    ${colorValues.flatMap((color) => sizeValues.map((size) => {
        const stock = getVariantStock(
            product,
            colors.length ? color : '',
            sizes.length ? size : ''
        );
        const price = getProductSalePrice(product, colors.length ? color : '', sizes.length ? size : '');
        return `<tr><td>${escapeHtml(color)}</td><td>${escapeHtml(size)}</td><td><strong>${stock}</strong></td><td>${currency.format(price)}</td></tr>`;
    })).join('')}
                </tbody>
            </table>
        </div>
    `;
    const headRow = container.querySelector('.variant-stock-table thead tr');
    if (headRow && headRow.children.length < 4) {
        headRow.insertAdjacentHTML('beforeend', '<th>Gia</th>');
    }
}

function renderDetailGallery(gallery, product) {
    const images = getProductImages(product);
    const [mainImage] = images;

    gallery.innerHTML = `
        <img src="${escapeAttr(mainImage)}" alt="${escapeAttr(product.name)}" loading="lazy" decoding="async">
        <div class="thumbs">
            ${images.map((image, index) => {
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

async function loadProductReviews(productId) {
    if (!detailReviewsPane || !productId) return;

    const expectedProductId = Number(productId);
    detailReviewsPane.innerHTML = '<p class="review-status">Đang tải đánh giá...</p>';

    try {
        const response = await fetch(`/api/products/${expectedProductId}/reviews`, {
            headers: authHeaders(false),
            cache: 'no-store'
        });
        const data = await response.json();

        if (Number(currentDetailProductId) !== expectedProductId) return;
        if (!response.ok) {
            throw new Error(data.message || 'Không tải được đánh giá.');
        }

        currentReviewData = data;
        renderProductReviews(data);
        updateDetailRatingSummary(data.summary);
    } catch (error) {
        detailReviewsPane.innerHTML = `<p class="review-status error">${escapeHtml(error.message)}</p>`;
        updateDetailRatingSummary({ average: 0, count: 0 });
    }
}

function renderProductReviews(data = {}) {
    if (!detailReviewsPane) return;

    const reviews = Array.isArray(data.reviews) ? data.reviews : [];
    const summary = data.summary || { average: 0, count: 0 };
    const reviewableOrders = Array.isArray(data.reviewableOrders) ? data.reviewableOrders : [];
    const reviewForm = renderReviewForm(data.canReview, reviewableOrders);
    const reviewItems = reviews.length
        ? reviews.map(renderReviewItem).join('')
        : '<p class="review-status">Chưa có đánh giá nào.</p>';

    detailReviewsPane.innerHTML = `
        <div class="reviews-summary">
            <div>
                <strong>${Number(summary.average || 0).toFixed(1)}</strong>
                <span>${renderStars(summary.average || 0)}</span>
            </div>
            <p>${Number(summary.count || 0)} đánh giá</p>
        </div>
        ${reviewForm}
        <div class="reviews-list">${reviewItems}</div>
    `;
}

function renderReviewForm(canReview, reviewableOrders) {
    if (!currentUser?.token) {
        return '<p class="review-status">Đăng nhập và mua hàng thành công để đánh giá sản phẩm.</p>';
    }

    if (!canReview) {
        return '<p class="review-status">Bạn có thể đánh giá sau khi đơn hàng chứa sản phẩm này được giao thành công.</p>';
    }

    const orderOptions = reviewableOrders.map((order) => {
        return `<option value="${Number(order.id)}">${escapeHtml(order.orderId || `Đơn #${order.id}`)}</option>`;
    }).join('');

    return `
        <form id="detailReviewForm" class="review-form">
            <label>
                Điểm đánh giá
                <select name="rating" required>
                    <option value="5">5 sao</option>
                    <option value="4">4 sao</option>
                    <option value="3">3 sao</option>
                    <option value="2">2 sao</option>
                    <option value="1">1 sao</option>
                </select>
            </label>
            <label>
                Don hang
                <select name="orderId" required>${orderOptions}</select>
            </label>
            <label class="full-width">
                Nhan xet
                <textarea name="comment" rows="3" maxlength="2000" placeholder="Chia se cam nhan sau khi mua hang"></textarea>
            </label>
            <button type="submit" class="black-btn">Gửi đánh giá</button>
            <p class="review-form-message"></p>
        </form>
    `;
}

function renderReviewItem(review) {
    const createdAt = review.createdAt ? new Date(review.createdAt).toLocaleDateString('vi-VN') : '';
    return `
        <article class="review-card">
            <header>
                <strong>${escapeHtml(review.authorName || 'Khách hàng')}</strong>
                <span>${renderStars(review.rating || 0)}</span>
            </header>
            ${review.comment ? `<p>${escapeHtml(review.comment)}</p>` : ''}
            <small>${createdAt ? escapeHtml(createdAt) : ''}</small>
        </article>
    `;
}

function renderStars(rating) {
    const score = Math.round(Number(rating) || 0);
    return Array.from({ length: 5 }, (_, index) => {
        return `<i class="bi ${index < score ? 'bi-star-fill' : 'bi-star'}"></i>`;
    }).join('');
}

function updateDetailRatingSummary(summary = {}) {
    const rating = document.querySelector('.detail-card .rating');
    if (!rating) return;

    const value = rating.querySelector('span');
    if (value) value.textContent = Number(summary.average || 0).toFixed(1);
    const stars = rating.querySelector('.stars');
    if (stars) stars.innerHTML = renderStars(summary.average || 0);
    const count = rating.querySelector('[data-review-count]');
    if (count) count.textContent = `${Number(summary.count || 0)} đánh giá`;
}

async function submitProductReview(form) {
    if (!currentUser?.token || !currentDetailProductId) return;

    const message = form.querySelector('.review-form-message');
    if (message) message.textContent = 'Đang gửi đánh giá...';

    try {
        const payload = {
            rating: Number(form.elements.rating.value),
            orderId: Number(form.elements.orderId.value),
            comment: form.elements.comment.value
        };
        const response = await fetch(`/api/products/${currentDetailProductId}/reviews`, {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (!response.ok) {
            if (message) message.textContent = data.message || 'Không gửi được đánh giá.';
            return;
        }

        showToast('Đã gửi đánh giá.', 'success');
        await loadProductReviews(currentDetailProductId);
    } catch {
        if (message) message.textContent = 'Không kết nối được server.';
    }
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
    const primaryImage = getProductImages(product)[0];

    return `
        <button class="related-product-card" type="button" data-product-id="${product.id}">
            <img src="${escapeAttr(primaryImage)}" alt="${escapeAttr(product.name)}" loading="lazy" decoding="async">
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
        card.hidden = filter !== 'all' && card.dataset.type !== filter;
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
    let color = '';
    if (getProductColors(product).length) {
        color = button.classList.contains('add-detail-cart')
            ? (document.querySelector('.detail-card .color-list button.selected')?.dataset.color || '')
            : (productContainer?.querySelector('.product-color-select')?.value || '');

        if (!color) {
            showToast('Vui lòng chọn màu', 'error');
            return;
        }
    }

    if (requiresSize(product)) {
        if (button.classList.contains('add-detail-cart')) {
            size = document.querySelector('.detail-card .size-list button.selected')?.dataset.size || '';
        } else {
            size = productContainer?.querySelector('.product-size-select')?.value || '';
        }

        if (!size) {
            showToast(contentText('messages.cart.chooseSize', 'Vui lòng chọn kích cỡ'), 'error');
            return;
        }

        if (getVariantStock(product, color, size) <= 0) {
            showToast(contentText('messages.cart.sizeSoldOut', 'Kích cỡ này tạm hết hàng'), 'error');
            return;
        }
    }

    addToCart(product, size, color);
}

function updateProductCardVariantPrice(card) {
    if (!card) return;

    const productId = Number(card.dataset.productId || 0);
    const product = products.find((item) => Number(item.id) === productId);
    const priceContainer = card.querySelector('.product-card-price');
    if (!product || !priceContainer) return;

    const colors = getProductColors(product);
    const sizes = getProductSizes(product);
    const color = colors.length ? (card.querySelector('.product-color-select')?.value || '') : '';
    const size = sizes.length ? (card.querySelector('.product-size-select')?.value || '') : '';
    const selectionComplete = (!colors.length || color) && (!sizes.length || size);

    priceContainer.innerHTML = selectionComplete
        ? renderPrice(product, color, size)
        : renderPrice(product);
    card.dataset.price = selectionComplete
        ? getProductSalePrice(product, color, size)
        : getProductSalePrice(product);
}

function addToCart(product, size, color = '') {
    const productId = Number(product.id);
    const normalizedSize = size ? String(size) : '';
    const normalizedColor = color ? String(color) : '';
    const item = cart.find((entry) => {
        return Number(entry.productId) === productId &&
            String(entry.size || '') === normalizedSize &&
            String(entry.color || '') === normalizedColor;
    });

    if (!canAddQuantity(product, normalizedSize, normalizedColor, item ? item.quantity : 0)) {
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
            color: normalizedColor || null,
            quantity: 1,
            price: getProductSalePrice(product, normalizedColor, normalizedSize)
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

    if (change > 0 && product && !canAddQuantity(product, item.size || '', item.color || '', item.quantity)) {
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

    if (cartCount) cartCount.textContent = totalQty;
    if (subtotal) subtotal.textContent = currency.format(total);
    if (checkoutMessage) checkoutMessage.textContent = '';
    if (cart.length && vietQrPaymentPanel && !vietQrPaymentPanel.hidden) resetVietQrPanel();
    if (!cartItems) return;

    if (!cart.length) {
        cartItems.innerHTML = `<p class="empty-cart">${escapeHtml(contentText('messages.cart.empty', 'Chưa có sản phẩm trong giỏ.'))}</p>`;
        return;
    }

    const sizeLabel = contentText('labels.size', 'Kích cỡ');
    const decreaseQty = contentText('labels.decreaseQty', 'Giảm số lượng');
    const increaseQty = contentText('labels.increaseQty', 'Tăng số lượng');

    cartItems.innerHTML = cart.map((item, index) => `
        <div class="cart-line">
            <div>
                <strong>${escapeHtml(item.name)}</strong>
                ${item.color ? `<small>Màu: ${escapeHtml(item.color)}</small>` : ''}
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
    if (!searchResults) return;
    const normalized = normalizeSearchText(query);
    const tokens = normalized.split(' ').filter(Boolean);
    const matches = products
        .filter((product) => {
            const haystack = getProductSearchText(product);
            return !tokens.length || tokens.every((token) => haystack.includes(token));
        })
        .slice(0, 6);

    const resultItems = matches.map((product) => `
        <button type="button" class="search-result" data-product-id="${product.id}">
            <span>${escapeHtml(product.name)} · ${escapeHtml(getSearchCategoryLabel(product))}</span>
            ${renderPrice(product)}
        </button>
    `).join('');
    const emptyMessage = normalized && !matches.length
        ? '<p class="search-empty">Không tìm thấy gợi ý phù hợp. Hãy thử từ khóa khác.</p>'
        : '';
    const allResultsLink = normalized
        ? `<a class="search-all-link" href="${escapeAttr(buildSearchUrl({ query }))}">Xem tất cả kết quả cho “${escapeHtml(query.trim())}” <i class="bi bi-arrow-right"></i></a>`
        : '';

    searchResults.innerHTML = resultItems + emptyMessage + allResultsLink;
}

function normalizeSearchText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function getProductSearchText(product) {
    const category = normalizeSearchText(product?.category);
    const colors = getProductColors(product);
    const productIdentity = normalizeSearchText(`${product?.name || ''} ${product?.displayCategory || ''}`);
    const relatedProductTerms = SEARCH_PRODUCT_GROUPS.filter((terms) => {
        return terms.some((term) => productIdentity.includes(normalizeSearchText(term)));
    }).flat();
    const relatedColors = colors.flatMap((color) => {
        const normalizedColor = normalizeSearchText(color);
        return SEARCH_COLOR_GROUPS.filter((terms) => {
            return terms.some((term) => normalizedColor.includes(normalizeSearchText(term)));
        }).flat();
    });

    return normalizeSearchText([
        product?.name,
        product?.displayCategory,
        product?.category,
        'sản phẩm màu màu sắc product color',
        ...colors,
        ...(SEARCH_CATEGORY_TERMS[category] || []),
        ...relatedProductTerms,
        ...relatedColors
    ].filter(Boolean).join(' '));
}

function getSearchCategoryLabel(product) {
    const category = String(product?.category || '').toLowerCase();
    const displayCategory = String(product?.displayCategory || '').toLowerCase();

    if (category === 'shoes' || displayCategory === 'sneaker') return 'Giày sneaker';
    if (category === 'clothing' || displayCategory === 'apparel') return 'Quần áo';
    return 'Phụ kiện';
}

async function initSearchPage() {
    if (!searchPageForm || !searchPageGrid) return;

    renderSearchPageFilterOptions();
    const params = new URLSearchParams(window.location.search);
    if (searchPageInput) searchPageInput.value = params.get('q') || '';
    if (searchPageCategory) searchPageCategory.value = params.get('category') || '';
    if (searchPageColor) searchPageColor.value = params.get('color') || '';
    await renderSearchPage();
}

function renderSearchPageFilterOptions() {
    if (searchPageCategory) {
        const categories = Array.from(new Set(products.map((product) => String(product.category || '')).filter(Boolean)));
        searchPageCategory.innerHTML = [
            '<option value="">Tất cả phân loại</option>',
            ...categories.map((category) => {
                const product = products.find((item) => String(item.category) === category);
                return `<option value="${escapeAttr(category)}">${escapeHtml(getSearchCategoryLabel(product))}</option>`;
            })
        ].join('');
    }

    if (searchPageColor) {
        const colors = Array.from(new Set(products.flatMap(getProductColors)))
            .sort((left, right) => left.localeCompare(right, 'vi'));
        searchPageColor.innerHTML = [
            '<option value="">Tất cả màu sắc</option>',
            ...colors.map((color) => `<option value="${escapeAttr(color)}">${escapeHtml(color)}</option>`)
        ].join('');
    }
}

function updateSearchPage() {
    const query = searchPageInput?.value || '';
    const category = searchPageCategory?.value || '';
    const color = searchPageColor?.value || '';
    const url = buildSearchUrl({ query, category, color });

    window.history.replaceState({}, '', url);
    renderSearchPage();
}

async function renderSearchPage() {
    if (!searchPageGrid) return;

    const query = searchPageInput?.value.trim() || '';
    const category = searchPageCategory?.value || '';
    const color = searchPageColor?.value || '';
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    if (color) params.set('color', color);

    searchPageGrid.classList.add('product-loading');
    searchPageGrid.innerHTML = '<p class="search-page-status">Đang tìm sản phẩm phù hợp...</p>';

    try {
        const response = await fetch(`/api/products?${params.toString()}`);
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.products)) {
            throw new Error(data.message || 'Không tải được kết quả tìm kiếm');
        }

        const matches = data.products;
        searchPageGrid.classList.remove('product-loading');
        searchPageGrid.innerHTML = matches.length
            ? matches.map((product) => renderProductCard(product, true)).join('')
            : '<div class="search-page-empty"><i class="bi bi-search"></i><h2>Không tìm thấy sản phẩm</h2><p>Hãy thử từ khóa, phân loại hoặc màu sắc khác.</p></div>';

        if (searchPageTitle) {
            searchPageTitle.textContent = query ? `Kết quả cho “${query}”` : 'Tất cả sản phẩm';
        }
        if (searchPageSummary) {
            const details = [
                category ? getSearchCategoryLabel({ category }) : '',
                color ? `Màu ${color}` : ''
            ].filter(Boolean);
            searchPageSummary.textContent = `${matches.length} sản phẩm${details.length ? ` · ${details.join(' · ')}` : ''}`;
        }
        document.title = query
            ? `Tìm kiếm: ${query} | Shop Anh Thuận`
            : 'Tìm kiếm sản phẩm | Shop Anh Thuận';
    } catch (error) {
        searchPageGrid.classList.remove('product-loading');
        searchPageGrid.innerHTML = `<p class="search-page-status search-page-error">${escapeHtml(error.message)}</p>`;
        if (searchPageSummary) searchPageSummary.textContent = '';
    }
}

function buildSearchUrl({ query = '', category = '', color = '' } = {}) {
    const params = new URLSearchParams();
    if (String(query).trim()) params.set('q', String(query).trim());
    if (String(category).trim()) params.set('category', String(category).trim());
    if (String(color).trim()) params.set('color', String(color).trim());
    const queryString = params.toString();
    return `/search.html${queryString ? `?${queryString}` : ''}`;
}

function scrollToProduct(productId) {
    const card = document.querySelector(`[data-product-id="${CSS.escape(String(productId))}"]`);
    renderProductDetail(Number(productId));
    const modal = bootstrap.Modal.getInstance(document.getElementById('searchModal'));
    if (modal) modal.hide();

    const target = document.getElementById('product-detail') || card;
    if (!document.getElementById('product-detail')) {
        window.location.href = `/product.html?id=${encodeURIComponent(productId)}`;
        return;
    }
    if (window.location.pathname.endsWith('/product.html')) {
        window.history.pushState({}, '', `/product.html?id=${encodeURIComponent(productId)}`);
    }
    if (target) {
        target.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }
}

async function startVietQrCheckout() {
    const amount = cart.reduce((sum, item) => {
        return sum + Number(item.price || 0) * Number(item.quantity || 0);
    }, 0);

    if (!amount) {
        checkoutMessage.textContent = contentText('messages.vietqr.needItems', 'Vui lòng thêm sản phẩm trước khi thanh toán VietQR.');
        return;
    }

    if (!currentUser?.token) {
        checkoutMessage.textContent = contentText('messages.vietqr.needLogin', 'Vui lòng đăng nhập trước khi thanh toán VietQR.');
        showAuthModal();
        return;
    }

    if (!hasCompleteProfile(currentUser)) {
        checkoutMessage.textContent = contentText('messages.vietqr.profileMissing', 'Vui lòng cập nhật tên, số điện thoại và địa chỉ ở tài khoản.');
        if (profileFullName) {
            profileFullName.focus();
        } else {
            window.location.href = '/profile.html';
        }
        return;
    }

    resetVietQrPanel();
    checkoutMessage.textContent = contentText('messages.vietqr.creating', 'Đang tạo mã VietQR...');

    try {
        const response = await fetch('/api/payments/vietqr', {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({
                description: contentText('messages.vietqr.description', 'Thanh toán VietQR'),
                items: getCheckoutItems()
            })
        });

        const data = await response.json();

        if (!response.ok) {
            checkoutMessage.textContent = data.message || contentText('messages.vietqr.createFailed', 'Không tạo được mã VietQR.');
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
        renderSearch(searchInput?.value || '');
        await loadOrderHistory();
        await loadNotifications();
        if (currentUser.role === 'Admin') {
            await loadAdminOrders();
        }
        renderVietQrPayment(data);
        checkoutMessage.textContent = contentTemplate('messages.vietqr.created', { orderId: data.orderId }, 'Đã tạo đơn VietQR {orderId}.');
        showToast('Đơn hàng đã tạo thành công. Vui lòng quét mã VietQR để thanh toán.', 'success', 5000);
    } catch {
        checkoutMessage.textContent = contentText('messages.common.serverDisconnected', 'Không kết nối được server.');
    }
}

async function startPayOsCheckout() {
    const amount = cart.reduce((sum, item) => {
        return sum + Number(item.price || 0) * Number(item.quantity || 0);
    }, 0);

    if (!amount) {
        checkoutMessage.textContent = contentText('messages.payos.needItems', 'Vui lòng thêm sản phẩm trước khi thanh toán payOS.');
        return;
    }

    if (!currentUser?.token) {
        checkoutMessage.textContent = contentText('messages.payos.needLogin', 'Vui lòng đăng nhập trước khi thanh toán payOS.');
        showAuthModal();
        return;
    }

    if (!hasCompleteProfile(currentUser)) {
        checkoutMessage.textContent = contentText('messages.payos.profileMissing', 'Vui lòng cập nhật tên, số điện thoại và địa chỉ ở tài khoản.');
        if (profileFullName) {
            profileFullName.focus();
        } else {
            window.location.href = '/profile.html';
        }
        return;
    }

    resetVietQrPanel();
    checkoutMessage.textContent = contentText('messages.payos.creating', 'Đang tạo link thanh toán payOS...');

    try {
        const response = await fetch('/api/payments/payos', {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({
                description: contentText('messages.payos.description', 'Thanh toán payOS'),
                items: getCheckoutItems()
            })
        });
        const data = await response.json();

        if (!response.ok || !data.checkoutUrl) {
            checkoutMessage.textContent = data.message || contentText('messages.payos.createFailed', 'Không tạo được link thanh toán payOS.');
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
        renderSearch(searchInput?.value || '');
        await loadOrderHistory();
        await loadNotifications();
        if (currentUser.role === 'Admin') {
            await loadAdminOrders();
        }

        checkoutMessage.textContent = contentTemplate('messages.payos.created', { orderId: data.orderId }, 'Đã tạo link payOS cho đơn {orderId}. Đang chuyển sang trang thanh toán...');
        showToast('Đang chuyển sang payOS để thanh toán.', 'info', 3500);
        window.location.href = data.checkoutUrl;
    } catch {
        checkoutMessage.textContent = contentText('messages.common.serverDisconnected', 'Không kết nối được server.');
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
        if (profileFullName) {
            profileFullName.focus();
        } else {
            window.location.href = '/profile.html';
        }
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
        renderSearch(searchInput?.value || '');
        await loadOrderHistory();
        if (currentUser.role === 'Admin') {
            await loadAdminOrders();
        }
        checkoutMessage.textContent = contentTemplate('messages.cod.created', { orderId: data.orderId }, 'Đã tạo đơn COD {orderId}.');
    } catch {
        checkoutMessage.textContent = contentText('messages.common.serverDisconnected', 'Không kết nối được server.');
    }
}

function renderVietQrPayment(data) {
    if (!data) return;

    ensureVietQrPanelInBody();
    if (!vietQrPaymentPanel) return;
    hideCartDrawer();

    const bank = data.bank || {};
    const amount = Number(data.amount) || 0;
    const orderDbId = Number(data.orderDbId || data.id || 0);
    vietQrPaymentPanel.innerHTML = `
        <section class="vietqr-dialog" role="dialog" aria-modal="true" aria-labelledby="vietQrDialogTitle">
            <button type="button" class="vietqr-close" data-vietqr-close aria-label="Đóng">
                <i class="bi bi-x-lg"></i>
            </button>
            <div class="vietqr-head">
                <div>
                    <strong id="vietQrDialogTitle">${escapeHtml(data.orderId || '')}</strong>
                    <span>Quét mã để chuyển khoản</span>
                </div>
                <i class="bi bi-qr-code"></i>
            </div>
            ${data.qrImageUrl ? `<img src="${escapeAttr(data.qrImageUrl)}" alt="Mã VietQR cho đơn ${escapeAttr(data.orderId || '')}" loading="lazy" decoding="async">` : ''}
            <dl>
                <div><dt>Số tiền</dt><dd>${escapeHtml(currency.format(amount))}</dd></div>
                <div><dt>Ngân hàng</dt><dd>${escapeHtml(bank.bankId || '')}</dd></div>
                <div><dt>Số tài khoản</dt><dd>${escapeHtml(bank.accountNo || '')}</dd></div>
                <div><dt>Chủ tài khoản</dt><dd>${escapeHtml(bank.accountName || '')}</dd></div>
                <div><dt>Nội dung</dt><dd>${escapeHtml(data.transferContent || data.orderId || '')}</dd></div>
            </dl>
            <div class="vietqr-actions">
                <button type="button" class="outline-btn" data-vietqr-close>Đóng</button>
            </div>
            <p class="vietqr-note">Sau khi chuyển khoản thành công, hệ thống sẽ tự động cập nhật trạng thái đơn hàng.</p>
        </section>
    `;
    vietQrPaymentPanel.hidden = false;
    document.body.classList.add('vietqr-open');
    startVietQrPaymentPolling(orderDbId);
}

function resetVietQrPanel() {
    if (!vietQrPaymentPanel) return;
    stopVietQrPaymentPolling();
    vietQrPaymentPanel.hidden = true;
    vietQrPaymentPanel.innerHTML = '';
    document.body.classList.remove('vietqr-open');
}

function ensureVietQrPanelInBody() {
    if (!vietQrPaymentPanel) {
        vietQrPaymentPanel = document.createElement('div');
        vietQrPaymentPanel.id = 'vietQrPaymentPanel';
        vietQrPaymentPanel.className = 'vietqr-panel';
        vietQrPaymentPanel.hidden = true;
    }

    if (vietQrPaymentPanel.parentElement !== document.body) {
        document.body.appendChild(vietQrPaymentPanel);
    }
}

function hideCartDrawer() {
    const cartDrawer = document.getElementById('cartDrawer');
    if (!cartDrawer || typeof bootstrap === 'undefined') return;

    const drawer = bootstrap.Offcanvas.getInstance(cartDrawer);
    if (drawer) drawer.hide();
}

async function restoreVietQrPayment(orderId, button) {
    if (!currentUser?.token || !orderId) return;

    if (button) button.disabled = true;

    try {
        const response = await fetch(`/api/orders/${orderId}/vietqr`, {
            headers: authHeaders(false)
        });
        const data = await response.json();

        if (!response.ok || !data.payment) {
            showToast(data.message || 'Không lấy lại được mã VietQR.', 'error');
            if (button) button.disabled = false;
            return;
        }

        renderVietQrPayment(data.payment);
    } catch {
        showToast('Không kết nối được server.', 'error');
    } finally {
        if (button) button.disabled = false;
    }
}

function startVietQrPaymentPolling(orderId) {
    stopVietQrPaymentPolling();
    if (!currentUser?.token || !orderId) return;

    vietQrPaymentPollOrderId = Number(orderId);
    vietQrPaymentPollTimer = window.setInterval(() => {
        checkVietQrPaymentStatus(vietQrPaymentPollOrderId);
    }, 4000);
    checkVietQrPaymentStatus(vietQrPaymentPollOrderId);
}

function stopVietQrPaymentPolling() {
    if (vietQrPaymentPollTimer) {
        window.clearInterval(vietQrPaymentPollTimer);
        vietQrPaymentPollTimer = null;
    }
    vietQrPaymentPollOrderId = null;
}

async function checkVietQrPaymentStatus(orderId) {
    if (!currentUser?.token || !orderId) return;

    try {
        const response = await fetch('/api/orders/me', {
            headers: authHeaders(false),
            cache: 'no-store'
        });
        const data = await response.json();

        if (!response.ok || !Array.isArray(data.orders)) return;

        mergeUserOrders(data.orders);
        const order = userOrders.find((entry) => Number(entry.id) === Number(orderId));
        if (orderHistoryList) renderOrderHistory(userOrders);
        if (!order) return;

        const paymentStatus = String(order.status || '').toUpperCase();
        if (paymentStatus === 'PAID') {
            stopVietQrPaymentPolling();
            resetVietQrPanel();
            upsertNotification(userPaymentPayloadToNotification({
                id: order.id,
                orderId: order.orderId,
                status: order.status,
                updatedAt: order.updatedAt
            }));
            showToast(`Đơn ${order.orderId || ''} đã thanh toán thành công.`, 'success', 6000);
            if (checkoutMessage) checkoutMessage.textContent = `Đơn ${order.orderId || ''} đã thanh toán thành công.`;
            await loadNotifications();
        }
    } catch {
        // Polling is best effort; the next interval can try again.
    }
}

async function handlePaymentReturnNotice() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') !== 'payos') return;

    const status = String(params.get('status') || '').toUpperCase();
    const orderCode = params.get('orderCode') || '';
    const cancelled = params.get('cancel') === 'true' || status === 'CANCELLED';

    if (status === 'PAID') {
        const suffix = orderCode ? `Đơn ${orderCode} ` : '';
        showToast(`${suffix}đã thanh toán thành công.`, 'success', 6000);
        if (checkoutMessage) checkoutMessage.textContent = `${suffix}đã thanh toán thành công.`;
    } else if (cancelled) {
        showToast('Bạn đã hủy thanh toán payOS.', 'info', 4500);
    } else {
        showToast('Thanh toán payOS đang được xử lý.', 'info', 4500);
    }

    if (currentUser?.token) {
        await loadOrderHistory();
        await loadNotifications();
    }

    ['payment', 'status', 'orderCode', 'cancel'].forEach((key) => params.delete(key));
    const query = params.toString();
    window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`
    );
}

function getCheckoutItems() {
    return cart.map((item) => {
        return {
            productId: item.productId,
            size: item.size,
            color: item.color,
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
        await loadCartForCurrentUser();
        messageElement.textContent = contentText('messages.auth.success', 'Đăng nhập thành công.');
        updateAccountUi();
        syncCartWithProducts();
        renderCart();

        const modal = bootstrap.Modal.getInstance(document.getElementById('authModal'));
        if (modal) modal.hide();
    } catch {
        messageElement.textContent = contentText('messages.common.serverDisconnected', 'Không kết nối được server.');
    }
}

function showAuthModal() {
    if (!authModal || typeof bootstrap === 'undefined') {
        window.location.href = '/profile.html';
        return;
    }
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
    adminPageLinks.forEach((link) => {
        link.hidden = currentUser?.role !== 'Admin';
    });

    if (!currentUser?.token) {
        stopAdminOrderNotifications();
        stopUserOrderNotifications();
        if (accountStatus) accountStatus.textContent = contentText('messages.account.loggedOut', 'Chưa đăng nhập');
        if (openAuthButton) openAuthButton.hidden = false;
        if (logoutButton) logoutButton.hidden = true;
        if (profileLoggedOut) profileLoggedOut.hidden = false;
        if (profileLoggedIn) profileLoggedIn.hidden = true;
        if (profileForm) profileForm.hidden = false;
        if (profileMessage) profileMessage.textContent = '';
        if (orderHistoryPanel) orderHistoryPanel.hidden = true;
        if (orderHistoryList) orderHistoryList.innerHTML = '';
        if (orderHistoryMessage) orderHistoryMessage.textContent = '';
        if (returnsLoggedOut) returnsLoggedOut.hidden = false;
        if (returnsPanel) returnsPanel.hidden = true;
        if (returnOrdersList) returnOrdersList.innerHTML = '';
        if (returnOrdersMessage) returnOrdersMessage.textContent = '';
        if (returnsMessage) returnsMessage.textContent = '';
        if (adminOrdersBody) adminOrdersBody.innerHTML = '';
        if (adminOrdersMessage) adminOrdersMessage.textContent = '';
        if (notificationLoggedOut) notificationLoggedOut.hidden = false;
        if (notificationPanel) notificationPanel.hidden = true;
        if (notificationList) notificationList.innerHTML = '';
        if (notificationMessage) notificationMessage.textContent = '';
        notifications = [];
        if (adminPanel) adminPanel.hidden = true;
        if (adminAccessMessage) adminAccessMessage.hidden = false;
        return;
    }

    if (accountStatus) accountStatus.textContent = `${currentUser.username} - ${getRoleLabel(currentUser.role)}`;
    if (openAuthButton) openAuthButton.hidden = true;
    if (logoutButton) logoutButton.hidden = false;
    if (profileLoggedOut) profileLoggedOut.hidden = true;
    if (profileLoggedIn) profileLoggedIn.hidden = false;
    if (profileForm) profileForm.hidden = false;
    if (profileFullName) profileFullName.value = currentUser.fullName || '';
    if (profilePhone) profilePhone.value = currentUser.phone || '';
    fillProfileAddressFields(currentUser.address || '');
    updateProfileSummary();
    switchProfileTab('info');
    if (returnsLoggedOut) returnsLoggedOut.hidden = true;
    if (returnsPanel) returnsPanel.hidden = false;
    if (notificationLoggedOut) notificationLoggedOut.hidden = true;
    if (notificationPanel) notificationPanel.hidden = false;
    if (orderHistoryPanel) orderHistoryPanel.hidden = false;
    const isProfilePage = window.location.pathname.endsWith('/profile.html');
    const isNotificationPage = window.location.pathname.endsWith('/noti.html');
    if (notificationList && isNotificationPage) {
        loadNotifications();
    }
    if ((orderHistoryList && isProfilePage) || (notificationList && isNotificationPage && currentUser.role !== 'Admin')) {
        startUserOrderNotifications();
    } else {
        stopUserOrderNotifications();
    }
    const isReturnsPage = window.location.pathname.endsWith('/returns.html');
    if (returnOrdersList && isReturnsPage) {
        loadReturnOrdersPage();
    }
    const isAdminPage = window.location.pathname.endsWith('/admin.html');
    if (adminPanel) adminPanel.hidden = currentUser.role !== 'Admin' || !isAdminPage;
    if (adminAccessMessage) {
        adminAccessMessage.hidden = currentUser.role === 'Admin';
        const message = adminAccessMessage.querySelector('[data-admin-access-text]');
        if (message && currentUser.role !== 'Admin') {
            message.textContent = 'Tài khoản hiện tại không có quyền quản trị.';
        }
    }
    if (currentUser.role === 'Admin') {
        renderAdminStats();
        loadAdminRevenueSummary();
        if ((adminOrdersBody && isAdminPage) || (notificationList && isNotificationPage)) {
            startAdminOrderNotifications();
        } else {
            stopAdminOrderNotifications();
        }
    } else {
        stopAdminOrderNotifications();
    }
}

function updateProfileSummary() {
    const displayName = currentUser?.fullName || currentUser?.username || '';
    if (profileDisplayName) profileDisplayName.textContent = displayName || 'Thành viên';
    if (profileAvatarLetter) profileAvatarLetter.textContent = (displayName || 'U').trim().charAt(0).toUpperCase();
    if (profileRoleBadge) {
        profileRoleBadge.classList.toggle('admin', currentUser?.role === 'Admin');
        profileRoleBadge.classList.toggle('user', currentUser?.role !== 'Admin');
        profileRoleBadge.innerHTML = `<i class="bi ${currentUser?.role === 'Admin' ? 'bi-shield-check' : 'bi-person-fill'}"></i> ${escapeHtml(getRoleLabel(currentUser?.role))}`;
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
    if (normalizedTab === 'returns') {
        loadAdminReturnRequests();
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

    const revenue = orders.reduce((sum, order) => {
        return isRevenueOrder(order) ? sum + (Number(order.amount) || 0) : sum;
    }, 0);
    if (statOrderCount) statOrderCount.textContent = orders.length;
    if (statRevenue) statRevenue.textContent = currency.format(revenue);
}

function isRevenueOrder(order) {
    if (normalizeOrderFulfillmentStatus(order?.fulfillmentStatus) !== 'DELIVERED') return false;

    const paymentStatus = String(order?.status || '').toUpperCase();
    const revenuePaymentStatuses = new Set([
        'PAID',
        'COD_PENDING'
    ]);
    if (!revenuePaymentStatuses.has(paymentStatus)) return false;

    const returnRequest = order?.returnRequest;
    return !(
        String(returnRequest?.type || '').toLowerCase() === 'return' &&
        ['APPROVED', 'COMPLETED'].includes(String(returnRequest?.status || '').toUpperCase())
    );
}

async function loadNotifications() {
    if (!notificationList || !notificationMessage) return null;

    if (!currentUser?.token) {
        notifications = [];
        renderNotifications();
        return null;
    }

    notificationMessage.textContent = 'Đang tải thông báo...';
    const endpoint = currentUser.role === 'Admin' ? '/api/admin/notifications' : '/api/notifications/me';

    try {
        const response = await fetch(endpoint, {
            headers: authHeaders(false),
            cache: 'no-store'
        });
        const data = await response.json();

        if (!response.ok) {
            notificationMessage.textContent = data.message || 'Không tải được thông báo.';
            return null;
        }

        notifications = Array.isArray(data.notifications) ? data.notifications : [];
        renderNotifications();
        return notifications;
    } catch {
        notificationMessage.textContent = 'Không kết nối được server.';
        return null;
    }
}

function renderNotifications() {
    if (!notificationList || !notificationMessage) return;

    if (notificationAudience) {
        notificationAudience.textContent = currentUser?.role === 'Admin'
            ? 'Thông báo quản trị: đơn mới, đơn giao thành công, đổi/trả và đánh giá sản phẩm.'
            : 'Thông báo đơn hàng: đã xác nhận, đang giao, giao thành công hoặc bị hủy.';
    }

    if (!notifications.length) {
        notificationList.innerHTML = '<p class="empty-cart">Chưa có thông báo.</p>';
        notificationMessage.textContent = '';
        return;
    }

    notificationList.innerHTML = notifications.map(renderNotificationItem).join('');
    notificationMessage.textContent = '';
}

function renderNotificationItem(notification) {
    const tone = String(notification.tone || 'info').toLowerCase();
    const icon = notification.icon || getNotificationIcon(notification);
    const createdAt = formatOrderDate(notification.createdAt);
    const meta = [
        notification.orderId ? `Đơn ${notification.orderId}` : '',
        notification.amount ? currency.format(Number(notification.amount) || 0) : '',
        notification.productName || ''
    ].filter(Boolean).join(' · ');
    const stars = notification.rating
        ? `<span class="notification-stars" aria-label="${Number(notification.rating) || 0} sao">${renderStars(notification.rating)}</span>`
        : '';

    return `
        <article class="notification-card notification-${escapeAttr(tone)}">
            <div class="notification-icon"><i class="bi ${escapeAttr(icon)}"></i></div>
            <div class="notification-body">
                <header>
                    <strong>${escapeHtml(notification.title || 'Thông báo')}</strong>
                    ${createdAt ? `<small>${escapeHtml(createdAt)}</small>` : ''}
                </header>
                <p>${escapeHtml(notification.message || '')}</p>
                ${stars}
                ${meta ? `<footer>${escapeHtml(meta)}</footer>` : ''}
            </div>
        </article>
    `;
}

function getNotificationIcon(notification) {
    const type = String(notification?.type || '');
    if (type === 'order_created') return 'bi-bell-fill';
    if (type === 'order_delivered') return 'bi-check-circle-fill';
    if (type === 'return_requested') return 'bi-arrow-counterclockwise';
    if (type === 'product_review') return 'bi-star-fill';
    if (notification?.status === CANCELLED_FULFILLMENT_STATUS) return 'bi-x-circle';
    if (notification?.status === 'SHIPPING') return 'bi-truck';
    return 'bi-bag-check';
}

function upsertNotification(notification) {
    if (!notificationList || !notification) return;

    notifications = [
        notification,
        ...notifications.filter((item) => item.id !== notification.id)
    ].sort((a, b) => {
        const left = new Date(a.createdAt || 0).getTime();
        const right = new Date(b.createdAt || 0).getTime();
        return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
    }).slice(0, 120);
    renderNotifications();
}

function userOrderPayloadToNotification(payload) {
    if (!payload) return null;

    const status = normalizeOrderFulfillmentStatus(payload.fulfillmentStatus);
    const labels = {
        ORDERED: 'Đã đặt hàng',
        PREPARING: 'Đã xác nhận',
        SHIPPING: 'Đang giao',
        DELIVERED: 'Giao thành công',
        CANCELLED: 'Bị hủy'
    };
    const title = labels[status] || labels.ORDERED;

    return {
        id: `customer-order-${payload.id}-${status}`,
        audience: 'customer',
        type: 'order_status',
        tone: status === CANCELLED_FULFILLMENT_STATUS ? 'danger' : status === 'SHIPPING' ? 'info' : 'success',
        icon: status === CANCELLED_FULFILLMENT_STATUS ? 'bi-x-circle' : status === 'SHIPPING' ? 'bi-truck' : 'bi-bag-check',
        title,
        message: `Đơn ${payload.orderId || ''}: ${title.toLowerCase()}.`,
        orderDbId: payload.id,
        orderId: payload.orderId,
        status,
        createdAt: payload.updatedAt || new Date().toISOString()
    };
}

function userPaymentPayloadToNotification(payload) {
    if (!payload || String(payload.status || '').toUpperCase() !== 'PAID') return null;

    return {
        id: `customer-order-${payload.id}-PAID`,
        audience: 'customer',
        type: 'payment_status',
        tone: 'success',
        icon: 'bi-check-circle-fill',
        title: 'Thanh toán thành công',
        message: `Đơn ${payload.orderId || ''} đã thanh toán thành công.`,
        orderDbId: payload.id,
        orderId: payload.orderId,
        status: 'PAID',
        createdAt: payload.updatedAt || new Date().toISOString()
    };
}

function adminOrderCreatedPayloadToNotification(payload) {
    const customer = payload?.customer || {};
    return {
        id: `admin-new-order-${payload.id}`,
        audience: 'admin',
        type: 'order_created',
        tone: 'info',
        icon: 'bi-bell-fill',
        title: 'Có đơn hàng mới',
        message: `${customer.fullName || customer.username || 'Khách hàng'} vừa đặt đơn ${payload.orderId || ''}.`,
        orderDbId: payload.id,
        orderId: payload.orderId,
        amount: payload.amount,
        createdAt: payload.createdAt || new Date().toISOString()
    };
}

function adminDeliveredPayloadToNotification(payload) {
    return {
        id: `admin-delivered-order-${payload.id}`,
        audience: 'admin',
        type: 'order_delivered',
        tone: 'success',
        icon: 'bi-check-circle-fill',
        title: 'Đơn hàng giao thành công',
        message: `Đơn ${payload.orderId || ''} đã được khách xác nhận nhận hàng.`,
        orderDbId: payload.id,
        orderId: payload.orderId,
        createdAt: payload.receivedAt || payload.updatedAt || new Date().toISOString()
    };
}

function adminReturnPayloadToNotification(payload) {
    const request = payload?.returnRequest || {};
    return {
        id: `admin-return-request-${request.id || payload.orderDbId || payload.orderId}`,
        audience: 'admin',
        type: 'return_requested',
        tone: 'warning',
        icon: 'bi-arrow-counterclockwise',
        title: 'Yêu cầu đổi/trả hàng',
        message: `Có yêu cầu đổi/trả cho đơn ${payload.orderId || request.orderId || ''}.`,
        orderDbId: payload.orderDbId || request.orderDbId,
        orderId: payload.orderId || request.orderId,
        returnRequestId: request.id,
        createdAt: request.createdAt || new Date().toISOString()
    };
}

function adminReviewPayloadToNotification(payload) {
    return {
        id: `admin-product-review-${payload.id}`,
        audience: 'admin',
        type: 'product_review',
        tone: 'review',
        icon: 'bi-star-fill',
        title: 'Khách hàng đánh giá sản phẩm',
        message: `${payload.authorName || 'Khách hàng'} đánh giá ${payload.productName || 'sản phẩm'} ${Number(payload.rating) || 0} sao.`,
        productId: payload.productId,
        productName: payload.productName || '',
        orderDbId: payload.orderDbId,
        orderId: payload.orderId,
        rating: Number(payload.rating) || 0,
        createdAt: payload.createdAt || new Date().toISOString()
    };
}

function updateAdminImagePreview() {
    if (!adminImagePreview) return;
    const images = splitImageList(document.getElementById('adminImage').value);

    adminImagePreview.innerHTML = images.length
        ? `<div class="admin-image-preview-grid">${images.map((image, index) => `
            <figure>
                <img src="${escapeAttr(image)}" alt="${escapeAttr(`${contentText('labels.imagePreview', 'Xem trước ảnh')} ${index + 1}`)}" loading="lazy" decoding="async">
                ${index === 0 ? '<figcaption>Ảnh đại diện</figcaption>' : ''}
            </figure>
        `).join('')}</div>`
        : `
            <div class="placeholder-icon">
                <i class="bi bi-image"></i>
                <small>${escapeHtml(contentText('labels.imagePreview', 'Xem trước ảnh'))}</small>
            </div>
        `;
}

async function loadOrderHistory() {
    if (!currentUser?.token || !orderHistoryList || !orderHistoryMessage) return;

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

        mergeUserOrders(Array.isArray(data.orders) ? data.orders : []);
        renderOrderHistory(userOrders);
        return userOrders;
    } catch {
        orderHistoryMessage.textContent = contentText('messages.common.serverDisconnected', 'Không kết nối được server.');
        return null;
    }
}

function mergeUserOrders(fetchedOrders) {
    const ordersById = new Map((Array.isArray(fetchedOrders) ? fetchedOrders : []).map((order) => [Number(order.id), order]));
    userOrders.forEach((existingOrder) => {
        const fetchedOrder = ordersById.get(Number(existingOrder.id));
        if (!fetchedOrder || getOrderUpdatedTime(existingOrder) > getOrderUpdatedTime(fetchedOrder)) {
            ordersById.set(Number(existingOrder.id), existingOrder);
        }
    });
    userOrders = Array.from(ordersById.values())
        .sort((a, b) => Number(b.id) - Number(a.id));
    return userOrders;
}

function upsertUserOrder(order) {
    if (!order) return userOrders;

    const orderId = Number(order.id);
    const exists = userOrders.some((entry) => Number(entry.id) === orderId);
    userOrders = exists
        ? userOrders.map((entry) => Number(entry.id) === orderId ? order : entry)
        : [order, ...userOrders];
    userOrders.sort((a, b) => Number(b.id) - Number(a.id));
    return userOrders;
}

function renderOrderHistory(orders) {
    if (!orderHistoryList || !orderHistoryMessage) return;

    if (!orders.length) {
        orderHistoryList.innerHTML = `<p class="empty-cart">${escapeHtml(contentText('messages.orders.empty', 'Chưa có đơn hàng.'))}</p>`;
        orderHistoryMessage.textContent = '';
        return;
    }

    orderHistoryList.innerHTML = orders.map((order) => {
        const items = Array.isArray(order.items) ? order.items : [];
        const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : '';
        const fulfillmentStatus = normalizeOrderFulfillmentStatus(order.fulfillmentStatus);
        const paymentStatusLabel = getOrderPaymentLabel(order.status, order.provider);
        const orderMeta = [
            order.provider || '',
            paymentStatusLabel,
            createdAt
        ].filter(Boolean).join(' - ');
        const itemRows = items.map((item) => {
            const size = item.size ? ` - Kích cỡ ${escapeHtml(item.size)}` : '';
            const color = item.color ? ` - Màu ${escapeHtml(item.color)}` : '';
            const reviewLink = fulfillmentStatus === 'DELIVERED' && item.productId
                ? ` <a class="order-review-link" href="/product.html?id=${encodeURIComponent(item.productId)}&review=1">Đánh giá</a>`
                : '';
            return `<li>${escapeHtml(item.name)}${color}${size} x ${Number(item.quantity) || 0}${reviewLink}</li>`;
        }).join('');
        const receivedButton = fulfillmentStatus === 'SHIPPING'
            ? `<button type="button" class="order-received-button" data-order-received="${Number(order.id)}">
                <i class="bi bi-box2-heart"></i> Xác nhận đã nhận hàng
               </button>`
            : '';
        const canCurrentUserCancel = currentUser?.role === 'Admin'
            ? fulfillmentStatus === 'ORDERED'
            : ['ORDERED', 'PREPARING'].includes(fulfillmentStatus);
        const cancelButton = canCurrentUserCancel
            ? `<button type="button" class="order-cancel-button" data-order-cancel="${Number(order.id)}" data-cancel-actor="customer">
                <i class="bi bi-x-circle"></i> Hủy đơn hàng
               </button>`
            : '';
        const returnButton = order.canRequestReturn
            ? `<a class="order-return-button" href="/returns.html?order=${encodeURIComponent(Number(order.id))}">
                <i class="bi bi-arrow-counterclockwise"></i> Yêu cầu đổi/trả
               </a>`
            : '';
        const vietQrRestoreButton = isUnpaidVietQrOrder(order)
            ? `<button type="button" class="order-return-button" data-vietqr-restore="${Number(order.id)}">
                <i class="bi bi-qr-code"></i> Lấy lại mã QR
               </button>`
            : '';
        const payOsCheckoutUrl = getPayOsCheckoutUrl(order);
        const payOsRestoreButton = isUnpaidPayOsOrder(order) && payOsCheckoutUrl
            ? `<a class="order-return-button" href="${escapeAttr(payOsCheckoutUrl)}">
                <i class="bi bi-credit-card"></i> Tiếp tục thanh toán payOS
               </a>`
            : '';
        const returnState = order.returnRequest
            ? `<div class="order-return-state">
                <strong>${escapeHtml(getReturnRequestTypeLabel(order.returnRequest.type))}</strong>
                <span>${escapeHtml(getReturnRequestStatusLabel(order.returnRequest.status))}</span>
                ${order.returnRequest.adminNote ? `<small>${escapeHtml(order.returnRequest.adminNote)}</small>` : ''}
               </div>`
            : '';
        const refundState = renderOrderRefundState(order);

        return `
            <article class="order-history-card">
                <header>
                    <div>
                        <h4>${escapeHtml(order.orderId || '')}</h4>
                        <small>${escapeHtml(orderMeta)}</small>
                    </div>
                    <span class="order-status">${escapeHtml(getOrderDisplayStatusLabel(order))}</span>
                </header>
                ${renderOrderFulfillmentProgress(fulfillmentStatus)}
                <ul>${itemRows}</ul>
                <footer>
                    <span>${escapeHtml(contentTemplate('labels.itemCount', { count: items.length }, '{count} mặt hàng'))}</span>
                    <strong>${currency.format(Number(order.amount) || 0)}</strong>
                </footer>
                ${receivedButton}
                ${cancelButton}
                ${vietQrRestoreButton}
                ${payOsRestoreButton}
                ${returnButton}
                ${returnState}
                ${refundState}
            </article>
        `;
    }).join('');
    orderHistoryMessage.textContent = '';
}

async function loadReturnOrdersPage() {
    if (!currentUser?.token || !returnOrdersList || !returnOrdersMessage) return null;

    returnOrdersMessage.textContent = 'Đang tải đơn hàng...';

    try {
        const response = await fetch('/api/orders/me', {
            headers: authHeaders(false),
            cache: 'no-store'
        });
        const data = await response.json();

        if (!response.ok) {
            returnOrdersMessage.textContent = data.message || 'Không tải được danh sách đơn hàng.';
            if (returnOrdersList) returnOrdersList.innerHTML = '';
            renderReturnOrderOptions([]);
            renderReturnSelectedOrderSummary();
            return null;
        }

        mergeUserOrders(Array.isArray(data.orders) ? data.orders : []);
        renderReturnOrdersPage(userOrders);
        return userOrders;
    } catch {
        returnOrdersMessage.textContent = 'Không kết nối được server.';
        if (returnOrdersList) returnOrdersList.innerHTML = '';
        renderReturnOrderOptions([]);
        renderReturnSelectedOrderSummary();
        return null;
    }
}

function renderReturnOrdersPage(orders) {
    if (!returnOrdersList) return;

    const normalizedOrders = Array.isArray(orders) ? orders : [];
    renderReturnOrderOptions(normalizedOrders);
    renderReturnSelectedOrderSummary();

    if (!normalizedOrders.length) {
        returnOrdersList.innerHTML = '<p class="empty-cart">Chưa có đơn hàng.</p>';
        if (returnOrdersMessage) returnOrdersMessage.textContent = '';
        return;
    }

    returnOrdersList.innerHTML = normalizedOrders.map(renderReturnOrderCard).join('');
    if (returnOrdersMessage) returnOrdersMessage.textContent = '';
}

function renderReturnOrderOptions(orders) {
    if (!returnOrderSelect) return;

    const eligibleOrders = orders.filter((order) => order.canRequestReturn);
    const currentValue = Number(returnOrderSelect.value);
    const requestedOrderId = Number(new URLSearchParams(window.location.search).get('order'));
    const selectedOrderId = eligibleOrders.some((order) => Number(order.id) === currentValue)
        ? currentValue
        : eligibleOrders.some((order) => Number(order.id) === requestedOrderId)
            ? requestedOrderId
            : Number(eligibleOrders[0]?.id || 0);

    const placeholder = eligibleOrders.length
        ? '<option value="">Chọn đơn hàng</option>'
        : '<option value="">Không có đơn đủ điều kiện</option>';
    const options = orders.map((order) => {
        const disabled = order.canRequestReturn ? '' : ' disabled';
        const selected = Number(order.id) === selectedOrderId ? ' selected' : '';
        const label = `${order.orderId || `Đơn #${order.id}`} - ${currency.format(Number(order.amount) || 0)} - ${getReturnOrderOptionStatus(order)}`;
        return `<option value="${Number(order.id)}"${disabled}${selected}>${escapeHtml(label)}</option>`;
    }).join('');

    returnOrderSelect.innerHTML = `${placeholder}${options}`;
    returnOrderSelect.disabled = !eligibleOrders.length;
    if (returnRequestType) returnRequestType.disabled = !eligibleOrders.length;
    if (returnReason) returnReason.disabled = !eligibleOrders.length;
    if (submitReturnRequestButton) submitReturnRequestButton.disabled = !eligibleOrders.length;
}

function renderReturnSelectedOrderSummary() {
    if (!returnSelectedOrderSummary || !returnOrderSelect) return;

    const order = userOrders.find((entry) => Number(entry.id) === Number(returnOrderSelect.value));
    if (!order) {
        returnSelectedOrderSummary.hidden = true;
        returnSelectedOrderSummary.innerHTML = '';
        return;
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const itemSummary = items
        .map((item) => {
            const color = item.color ? `, màu ${item.color}` : '';
            const size = item.size ? `, kích cỡ ${item.size}` : '';
            return `${item.name}${color}${size} x ${Number(item.quantity) || 0}`;
        })
        .join('; ');
    const deadline = getReturnDeadlineText(order);

    returnSelectedOrderSummary.innerHTML = `
        <strong>${escapeHtml(order.orderId || '')}</strong>
        <span>${escapeHtml(currency.format(Number(order.amount) || 0))}${deadline ? ` - ${escapeHtml(deadline)}` : ''}</span>
        ${itemSummary ? `<small>${escapeHtml(itemSummary)}</small>` : ''}
    `;
    returnSelectedOrderSummary.hidden = false;
}

function renderReturnOrderCard(order) {
    const fulfillmentStatus = normalizeOrderFulfillmentStatus(order.fulfillmentStatus);
    const createdAt = formatOrderDate(order.createdAt);
    const items = Array.isArray(order.items) ? order.items : [];
    const itemRows = items.map((item) => {
        const size = item.size ? ` - Kích cỡ ${escapeHtml(item.size)}` : '';
        const color = item.color ? ` - Màu ${escapeHtml(item.color)}` : '';
        return `<li>${escapeHtml(item.name)}${color}${size} x ${Number(item.quantity) || 0}</li>`;
    }).join('');
    const statusClass = order.canRequestReturn
        ? ''
        : order.returnRequest?.status === 'REJECTED'
            ? ' rejected'
            : ' locked';
    const statusLabel = order.canRequestReturn
        ? 'Có thể yêu cầu'
        : order.returnRequest
            ? getReturnRequestStatusLabel(order.returnRequest.status)
            : 'Chưa đủ điều kiện';
    const returnState = order.returnRequest
        ? `<div class="order-return-state">
            <strong>${escapeHtml(getReturnRequestTypeLabel(order.returnRequest.type))}</strong>
            <span>${escapeHtml(getReturnRequestStatusLabel(order.returnRequest.status))}</span>
            ${order.returnRequest.reason ? `<small>${escapeHtml(order.returnRequest.reason)}</small>` : ''}
            ${order.returnRequest.adminNote ? `<small>${escapeHtml(order.returnRequest.adminNote)}</small>` : ''}
           </div>`
        : '';
    const action = order.canRequestReturn
        ? `<button type="button" class="return-order-select-button" data-return-order-select="${Number(order.id)}">Chọn đơn này</button>`
        : '';
    const note = order.canRequestReturn
        ? getReturnDeadlineText(order)
        : getReturnUnavailableReason(order);

    return `
        <article class="return-order-card ${order.canRequestReturn ? 'eligible' : ''}">
            <header>
                <div>
                    <h3>${escapeHtml(order.orderId || '')}</h3>
                    <small>${escapeHtml(getOrderFulfillmentLabel(fulfillmentStatus))}${createdAt ? ` - ${escapeHtml(createdAt)}` : ''}</small>
                </div>
                <span class="return-order-status${statusClass}">${escapeHtml(statusLabel)}</span>
            </header>
            <ul>${itemRows}</ul>
            ${returnState}
            <footer>
                <p>${escapeHtml(note)}</p>
                <strong>${currency.format(Number(order.amount) || 0)}</strong>
                ${action}
            </footer>
        </article>
    `;
}

function selectReturnOrderForRequest(orderId) {
    if (!returnOrderSelect || !orderId) return;

    returnOrderSelect.value = String(orderId);
    renderReturnSelectedOrderSummary();

    const targetUrl = new URL(window.location.href);
    targetUrl.searchParams.set('order', String(orderId));
    window.history.replaceState(null, '', targetUrl);

    returnRequestForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    returnReason?.focus();
}

async function submitReturnRequestForm(event) {
    event.preventDefault();
    if (!currentUser?.token || !returnOrderSelect || !returnRequestType || !returnReason) return;

    const orderId = Number(returnOrderSelect.value);
    const type = String(returnRequestType.value || '').trim().toLowerCase();
    const reason = String(returnReason.value || '').trim();
    const order = userOrders.find((entry) => Number(entry.id) === orderId);

    if (!orderId || !order?.canRequestReturn) {
        if (returnsMessage) returnsMessage.textContent = 'Vui lòng chọn đơn hàng đủ điều kiện đổi/trả.';
        return;
    }

    if (!['return', 'exchange'].includes(type)) {
        if (returnsMessage) returnsMessage.textContent = 'Loại yêu cầu không hợp lệ.';
        return;
    }

    if (!reason) {
        if (returnsMessage) returnsMessage.textContent = 'Vui lòng nhập lý do đổi/trả hàng.';
        return;
    }

    const request = await createOrderReturnRequest(orderId, type, reason, {
        button: submitReturnRequestButton,
        messageElement: returnsMessage
    });

    if (!request) return;

    if (returnReason) returnReason.value = '';
    renderReturnOrdersPage(userOrders);
    if (orderHistoryList) renderOrderHistory(userOrders);
}

async function createOrderReturnRequest(orderId, type, reason, options = {}) {
    const { button, messageElement } = options;
    if (!currentUser?.token || !orderId) return null;

    if (button) button.disabled = true;
    if (messageElement) messageElement.textContent = 'Đang gửi yêu cầu đổi/trả...';

    try {
        const response = await fetch(`/api/orders/${orderId}/return-request`, {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({ type, reason })
        });
        const data = await response.json();

        if (!response.ok || !data.returnRequest) {
            if (messageElement) messageElement.textContent = data.message || 'Không tạo được yêu cầu đổi/trả.';
            showToast(data.message || 'Không tạo được yêu cầu đổi/trả.', 'error');
            if (button) button.disabled = false;
            return null;
        }

        userOrders = userOrders.map((order) => {
            if (Number(order.id) !== Number(orderId)) return order;
            return {
                ...order,
                canRequestReturn: false,
                returnRequest: data.returnRequest
            };
        });
        if (messageElement) messageElement.textContent = 'Đã gửi yêu cầu đổi/trả.';
        showToast('Đã gửi yêu cầu đổi/trả.', 'success');
        return data.returnRequest;
    } catch {
        if (messageElement) messageElement.textContent = 'Không kết nối được server.';
        showToast('Không kết nối được server.', 'error');
        if (button) button.disabled = false;
        return null;
    }
}

function getReturnOrderOptionStatus(order) {
    if (order.canRequestReturn) return 'Có thể yêu cầu';
    if (order.returnRequest) return getReturnRequestStatusLabel(order.returnRequest.status);
    return getReturnUnavailableReason(order);
}

function getReturnUnavailableReason(order) {
    if (order.returnRequest) {
        return `Đã có yêu cầu ${getReturnRequestTypeLabel(order.returnRequest.type).toLowerCase()}.`;
    }

    const status = normalizeOrderFulfillmentStatus(order.fulfillmentStatus);
    if (status === CANCELLED_FULFILLMENT_STATUS) return 'Đơn hàng đã hủy.';
    if (status !== 'DELIVERED') return 'Chỉ đổi/trả sau khi nhận hàng thành công.';
    if (!order.receivedAt) return 'Chưa ghi nhận thời điểm nhận hàng.';
    return 'Đã quá thời hạn đổi/trả 7 ngày.';
}

function getReturnDeadlineText(order) {
    if (!order.returnEligibleUntil) return '';

    const deadline = formatOrderDate(order.returnEligibleUntil);
    return deadline ? `Hạn đổi/trả: ${deadline}` : '';
}

function formatOrderDate(value) {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('vi-VN');
}

function renderOrderFulfillmentProgress(status) {
    if (status === CANCELLED_FULFILLMENT_STATUS) {
        return '<div class="order-cancelled-state"><i class="bi bi-x-circle-fill"></i> Đơn hàng đã hủy</div>';
    }

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
    if (normalized === CANCELLED_FULFILLMENT_STATUS) return normalized;
    return ORDER_FULFILLMENT_STEPS.some((step) => step.value === normalized)
        ? normalized
        : 'ORDERED';
}

function getOrderFulfillmentLabel(status) {
    if (status === CANCELLED_FULFILLMENT_STATUS) return 'Đã hủy';
    return ORDER_FULFILLMENT_STEPS.find((step) => step.value === status)?.label || 'Đã đặt hàng';
}

function getOrderDisplayStatusLabel(order) {
    const fulfillmentStatus = normalizeOrderFulfillmentStatus(order?.fulfillmentStatus);
    const paymentStatus = String(order?.status || '').toUpperCase();

    if (fulfillmentStatus === 'ORDERED') {
        if (paymentStatus === 'PAID') return 'Đã thanh toán';
        if (paymentStatus === 'PAYOS_PENDING') return 'Chờ thanh toán payOS';
        if (paymentStatus === VIETQR_WAITING_CONFIRMATION_STATUS) return 'Chờ xác nhận';
        if (paymentStatus === 'VIETQR_PENDING') return 'Chờ chuyển khoản';
    }

    return getOrderFulfillmentLabel(fulfillmentStatus);
}

function getOrderPaymentLabel(status, provider = '') {
    const normalized = String(status || '').toUpperCase();
    const labels = {
        PAYOS_PENDING: 'Chờ thanh toán payOS',
        VIETQR_PENDING: 'Chờ khách chuyển khoản',
        VIETQR_WAITING_CONFIRMATION: 'Chờ xác nhận chuyển khoản',
        COD_PENDING: 'Thanh toán khi nhận hàng',
        PAID: 'Đã thanh toán',
        PAID_AFTER_CANCEL: 'Đã thanh toán sau khi hủy',
        PAID_STOCK_ERROR: 'Đã thanh toán, lỗi tồn kho',
        FAILED: 'Thanh toán thất bại'
    };

    if (labels[normalized]) return labels[normalized];
    if (String(provider || '').toLowerCase() === 'payos') return 'Thanh toán payOS';
    if (String(provider || '').toLowerCase() === 'vietqr') return 'Thanh toán VietQR';
    if (String(provider || '').toLowerCase() === 'cod') return 'Thanh toán COD';
    return normalized;
}

function isUnpaidVietQrOrder(order) {
    if (String(order?.provider || '').toLowerCase() !== 'vietqr') return false;
    if (normalizeOrderFulfillmentStatus(order?.fulfillmentStatus) === CANCELLED_FULFILLMENT_STATUS) return false;

    const paymentStatus = String(order?.status || '').toUpperCase();
    return !['PAID', 'PAID_AFTER_CANCEL', 'FAILED'].includes(paymentStatus);
}

function isUnpaidPayOsOrder(order) {
    if (String(order?.provider || '').toLowerCase() !== 'payos') return false;
    if (normalizeOrderFulfillmentStatus(order?.fulfillmentStatus) === CANCELLED_FULFILLMENT_STATUS) return false;

    const paymentStatus = String(order?.status || '').toUpperCase();
    return !['PAID', 'PAID_AFTER_CANCEL', 'FAILED'].includes(paymentStatus);
}

function getPayOsCheckoutUrl(order) {
    const candidates = [
        order?.checkoutUrl,
        order?.gatewayResponse?.checkoutUrl,
        order?.gatewayResponse?.data?.checkoutUrl,
        order?.gatewayResponse?.response?.data?.checkoutUrl
    ];
    const checkoutUrl = candidates.find(Boolean);
    if (!checkoutUrl) return '';

    try {
        const url = new URL(String(checkoutUrl));
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
        return '';
    }
}

function getReturnRequestTypeLabel(type) {
    return String(type || '').toLowerCase() === 'exchange' ? 'Đổi hàng' : 'Trả hàng';
}

function getReturnRequestStatusLabel(status) {
    const normalized = String(status || '').toUpperCase();
    const labels = {
        PENDING: 'Đang chờ xử lý',
        APPROVED: 'Đã chấp nhận',
        REJECTED: 'Đã từ chối',
        COMPLETED: 'Đã hoàn tất'
    };
    return labels[normalized] || labels.PENDING;
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
            throw new Error('Không mở được kết nối trạng thái đơn hàng');
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
    if (!payload) return;

    if (eventName === 'order.payment_status_changed') {
        userOrders = userOrders.map((order) => {
            if (Number(order.id) !== Number(payload.id)) return order;
            return {
                ...order,
                status: payload.status,
                updatedAt: payload.updatedAt || order.updatedAt
            };
        });
        renderOrderHistory(userOrders);
        if (String(payload.status || '').toUpperCase() === 'PAID') {
            upsertNotification(userPaymentPayloadToNotification(payload));
            showToast(`Đơn ${payload.orderId || ''} đã thanh toán thành công.`, 'success', 5000);
        }
        return;
    }

    if (eventName === 'order.refund_status_changed') {
        userOrders = userOrders.map((order) => {
            if (Number(order.id) !== Number(payload.id)) return order;
            return {
                ...order,
                status: payload.status || order.status,
                refundStatus: payload.refundStatus,
                refund: payload.refund || order.refund,
                updatedAt: payload.updatedAt || order.updatedAt
            };
        });
        renderOrderHistory(userOrders);
        showToast(getRefundSuccessToast(payload), 'info', 6000);
        return;
    }

    if (eventName !== 'order.fulfillment_changed') return;

    userOrders = userOrders.map((order) => {
        if (Number(order.id) !== Number(payload.id)) return order;
        return {
            ...order,
            status: payload.status || order.status,
            fulfillmentStatus: payload.fulfillmentStatus,
            refundStatus: payload.refundStatus || order.refundStatus,
            refund: payload.refund || order.refund,
            receivedAt: payload.receivedAt || null,
            updatedAt: payload.updatedAt || order.updatedAt
        };
    });
    renderOrderHistory(userOrders);
    upsertNotification(userOrderPayloadToNotification(payload));
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

async function requestOrderReturn(orderId) {
    if (!currentUser?.token || !orderId) return;

    window.location.href = `/returns.html?order=${encodeURIComponent(orderId)}`;
}

async function cancelOrderFromUi(orderId, actor) {
    if (!currentUser?.token || !orderId) return;

    const isAdminCancel = actor === 'admin';
    const confirmation = isAdminCancel
        ? 'Hủy đơn hàng này trước khi xác nhận? Tồn kho sẽ được hoàn lại.'
        : 'Bạn chắc chắn muốn hủy đơn hàng này? Tồn kho sẽ được hoàn lại.';
    if (!confirm(confirmation)) return;

    const button = document.querySelector(`[data-order-cancel="${orderId}"][data-cancel-actor="${actor}"]`);
    if (button) button.disabled = true;

    try {
        const response = await fetch(`/api/orders/${orderId}/cancel`, {
            method: 'POST',
            headers: authHeaders(false)
        });
        const data = await response.json();

        if (!response.ok || !data.order) {
            showToast(data.message || 'Không thể hủy đơn hàng.', 'error');
            if (button) button.disabled = false;
            return;
        }

        if (isAdminCancel) {
            adminOrders = adminOrders.map((order) => {
                return Number(order.id) === Number(orderId) ? data.order : order;
            });
            renderAdminOrders(adminOrders);
            renderAdminStats(adminOrders);
            loadAdminRevenueSummary();
        } else {
            userOrders = userOrders.map((order) => {
                return Number(order.id) === Number(orderId) ? data.order : order;
            });
            renderOrderHistory(userOrders);
        }

        await loadProducts();
        renderProducts();
        renderProductDetail();
        showToast('Đã hủy đơn hàng và hoàn lại tồn kho.', 'success');
    } catch {
        showToast('Không kết nối được server.', 'error');
        if (button) button.disabled = false;
    }
}

async function refundOrderFromUi(orderId) {
    if (!currentUser?.token || currentUser.role !== 'Admin' || !orderId) return;
    if (!confirm('Xác nhận tạo lệnh hoàn tiền tự động cho đơn này?')) return;

    const button = document.querySelector(`[data-order-refund="${orderId}"]`);
    if (button) button.disabled = true;

    try {
        const response = await fetch(`/api/orders/${orderId}/refund`, {
            method: 'POST',
            headers: adminHeaders()
        });
        const data = await response.json();

        if (!response.ok || !data.order) {
            showToast(data.message || 'Không tạo được lệnh hoàn tiền.', 'error', 6000);
            if (button) button.disabled = false;
            await loadAdminOrders();
            return;
        }

        adminOrders = adminOrders.map((order) => {
            return Number(order.id) === Number(orderId) ? data.order : order;
        });
        renderAdminOrders(adminOrders);
        renderAdminStats(adminOrders);
        loadAdminRevenueSummary();
        showToast(getRefundSuccessToast(data.order), 'success', 6000);
    } catch {
        showToast('Không kết nối được server.', 'error');
        if (button) button.disabled = false;
    }
}

async function loadAdminOrders() {
    if (!currentUser?.token || currentUser.role !== 'Admin' || !adminOrdersBody || !adminOrdersMessage) return null;

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
        loadAdminRevenueSummary();
        return adminOrders;
    } catch {
        adminOrdersMessage.textContent = contentText('messages.common.serverDisconnected', 'Không kết nối được server.');
        return null;
    }
}

async function loadAdminRevenueSummary() {
    if (!currentUser?.token || currentUser.role !== 'Admin' || !adminRevenueBreakdown) return null;

    try {
        const response = await fetch('/api/admin/revenue-summary', {
            headers: authHeaders(false),
            cache: 'no-store'
        });
        const data = await response.json();
        if (!response.ok || !data.summary) {
            throw new Error(data.message || 'Không tải được doanh thu.');
        }

        adminRevenueSummary = data.summary;
        renderAdminRevenueSummary(adminRevenueSummary);
        if (statRevenue) statRevenue.textContent = currency.format(Number(data.summary.totals?.revenue) || 0);
        if (statOrderCount) statOrderCount.textContent = Number(data.summary.totals?.orderCount) || 0;
        return adminRevenueSummary;
    } catch {
        return null;
    }
}

function renderAdminRevenueSummary(summary) {
    if (!adminRevenueBreakdown) return;

    const daily = Array.isArray(summary?.daily) ? summary.daily.slice(-7) : [];
    const monthly = Array.isArray(summary?.monthly) ? summary.monthly.slice(-6) : [];
    const yearly = Array.isArray(summary?.yearly) ? summary.yearly.slice(-5) : [];

    adminRevenueBreakdown.innerHTML = `
        ${renderRevenueGroup('Theo ngày', daily)}
        ${renderRevenueGroup('Theo tháng', monthly)}
        ${renderRevenueGroup('Theo năm', yearly)}
    `;
}

function renderRevenueGroup(title, rows) {
    const items = rows.length
        ? rows.map((row) => `
            <li>
                <span>${escapeHtml(row.period)}</span>
                <strong>${currency.format(Number(row.revenue) || 0)}</strong>
                <small>${Number(row.orderCount) || 0} đơn</small>
            </li>
        `).join('')
        : '<li><span>Chưa có dữ liệu</span><strong>0</strong><small>0 đơn</small></li>';

    return `
        <article>
            <h4>${escapeHtml(title)}</h4>
            <ul>${items}</ul>
        </article>
    `;
}

async function loadAdminReturnRequests() {
    if (!currentUser?.token || currentUser.role !== 'Admin' || !adminReturnRequestsBody || !adminReturnRequestsMessage) return null;

    adminReturnRequestsMessage.textContent = 'Đang tải yêu cầu đổi/trả...';

    try {
        const response = await fetch('/api/admin/return-requests', {
            headers: authHeaders(false),
            cache: 'no-store'
        });
        const data = await response.json();

        if (!response.ok) {
            adminReturnRequestsMessage.textContent = data.message || 'Không tải được yêu cầu đổi/trả.';
            return null;
        }

        adminReturnRequests = Array.isArray(data.requests) ? data.requests : [];
        renderAdminReturnRequests(adminReturnRequests);
        return adminReturnRequests;
    } catch {
        adminReturnRequestsMessage.textContent = 'Không kết nối được server.';
        return null;
    }
}

function renderAdminReturnRequests(requests) {
    if (!adminReturnRequestsBody) return;

    if (!requests.length) {
        adminReturnRequestsBody.innerHTML = '<tr><td colspan="5">Chưa có yêu cầu đổi/trả.</td></tr>';
        if (adminReturnRequestsMessage) adminReturnRequestsMessage.textContent = '';
        return;
    }

    adminReturnRequestsBody.innerHTML = requests.map((request) => {
        const customer = request.customer || {};
        const customerDetails = [customer.username ? `@${customer.username}` : '', customer.phone || '', customer.address || '']
            .filter(Boolean)
            .map(escapeHtml)
            .join('<br>');
        return `
            <tr>
                <td>
                    <strong>${escapeHtml(request.orderId || '')}</strong>
                    <small>${currency.format(Number(request.amount) || 0)}</small>
                </td>
                <td>
                    <div class="admin-customer">
                        <span>${escapeHtml(customer.fullName || customer.username || 'Khách hàng')}</span>
                        <small>${customerDetails}</small>
                    </div>
                </td>
                <td>
                    <strong>${escapeHtml(getReturnRequestTypeLabel(request.type))}</strong>
                    <small>${escapeHtml(request.reason || '')}</small>
                </td>
                <td>
                    <span class="return-status">${escapeHtml(getReturnRequestStatusLabel(request.status))}</span>
                    ${request.adminNote ? `<small>${escapeHtml(request.adminNote)}</small>` : ''}
                </td>
                <td>${renderReturnRequestActions(request)}</td>
            </tr>
        `;
    }).join('');
    if (adminReturnRequestsMessage) adminReturnRequestsMessage.textContent = '';
}

function renderReturnRequestActions(request) {
    const status = String(request.status || '').toUpperCase();
    if (status === 'PENDING') {
        return `
            <div class="admin-row-actions">
                <button type="button" data-return-request-id="${Number(request.id)}" data-return-status="APPROVED">Duyệt</button>
                <button type="button" data-return-request-id="${Number(request.id)}" data-return-status="REJECTED">Từ chối</button>
            </div>
        `;
    }

    if (status === 'APPROVED') {
        return `
            <div class="admin-row-actions">
                <button type="button" data-return-request-id="${Number(request.id)}" data-return-status="COMPLETED">Hoàn tất</button>
            </div>
        `;
    }

    return '<small>Đã xử lý</small>';
}

async function updateAdminReturnRequest(requestId, status) {
    if (!currentUser?.token || currentUser.role !== 'Admin' || !requestId) return;

    const adminNote = prompt('Ghi chú cho khách hàng (có thể để trống)', '');
    if (adminNote === null) return;

    try {
        const response = await fetch(`/api/admin/return-requests/${requestId}`, {
            method: 'PUT',
            headers: authHeaders(true),
            body: JSON.stringify({ status, adminNote })
        });
        const data = await response.json();

        if (!response.ok || !data.returnRequest) {
            showToast(data.message || 'Không cập nhật được yêu cầu.', 'error');
            return;
        }

        adminReturnRequests = adminReturnRequests.map((request) => {
            return Number(request.id) === Number(requestId) ? data.returnRequest : request;
        });
        renderAdminReturnRequests(adminReturnRequests);
        loadAdminRevenueSummary();
        showToast('Đã cập nhật yêu cầu đổi/trả.', 'success');
    } catch {
        showToast('Không kết nối được server.', 'error');
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
            throw new Error('Không mở được kết nối thông báo đơn hàng');
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
        loadAdminRevenueSummary();
        upsertNotification(adminOrderCreatedPayloadToNotification(payload));
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

    if (eventName === 'order.payment_status_changed') {
        adminOrders = adminOrders.map((order) => {
            if (Number(order.id) !== Number(payload.id)) return order;
            return {
                ...order,
                status: payload.status,
                updatedAt: payload.updatedAt || order.updatedAt
            };
        });
        renderAdminOrders(adminOrders);
        renderAdminStats(adminOrders);
        loadAdminRevenueSummary();
        return;
    }

    if (eventName === 'order.fulfillment_changed') {
        adminOrders = adminOrders.map((order) => {
            if (Number(order.id) !== Number(payload.id)) return order;
            return {
                ...order,
                status: payload.status || order.status,
                fulfillmentStatus: payload.fulfillmentStatus,
                refundStatus: payload.refundStatus || order.refundStatus,
                refund: payload.refund || order.refund,
                receivedAt: payload.receivedAt || null,
                updatedAt: payload.updatedAt || order.updatedAt
            };
        });
        renderAdminOrders(adminOrders);
        loadAdminRevenueSummary();
        if (normalizeOrderFulfillmentStatus(payload.fulfillmentStatus) === 'DELIVERED') {
            upsertNotification(adminDeliveredPayloadToNotification(payload));
        }
        return;
    }

    if (eventName === 'order.refund_status_changed') {
        adminOrders = adminOrders.map((order) => {
            if (Number(order.id) !== Number(payload.id)) return order;
            return {
                ...order,
                status: payload.status || order.status,
                refundStatus: payload.refundStatus,
                refund: payload.refund || order.refund,
                updatedAt: payload.updatedAt || order.updatedAt
            };
        });
        renderAdminOrders(adminOrders);
        renderAdminStats(adminOrders);
        loadAdminRevenueSummary();
        showToast(getRefundSuccessToast(payload), 'info', 6000);
        return;
    }

    if (eventName === 'order.return_requested') {
        loadAdminReturnRequests();
        upsertNotification(adminReturnPayloadToNotification(payload));
        showToast(`Có yêu cầu đổi/trả cho đơn ${payload.orderId || ''}`, 'info', 6000);
        return;
    }

    if (eventName === 'product.review_created') {
        upsertNotification(adminReviewPayloadToNotification(payload));
        showToast(`Có đánh giá mới cho ${payload.productName || 'sản phẩm'}`, 'info', 6000);
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
        renderAdminStats(adminOrders);
        loadAdminRevenueSummary();
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
            const size = item.size ? `Kích cỡ ${escapeHtml(item.size)} - ` : '';
            const color = item.color ? `Màu ${escapeHtml(item.color)} - ` : '';
            return `
                <span>${escapeHtml(item.name)} x ${Number(item.quantity) || 0}</span>
                <small>${color}${size}${currency.format(Number(item.unitPrice) || 0)}</small>
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
        const paymentStatusLabel = getOrderPaymentLabel(order.status, order.provider);
        const refundAction = getAdminRefundAction(order);

        return `
            <tr class="${order.isNew ? 'admin-order-new' : ''}">
                <td>
                    <div class="admin-order-code">
                        <strong>${escapeHtml(order.orderId || '')}</strong>
                        ${newOrderBadge}
                    </div>
                    <small>${escapeHtml(paymentStatusLabel)}</small>
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
                        ${refundAction}
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
            <div class="admin-order-actions">
                <button type="button" data-order-id="${Number(orderId)}" data-order-fulfillment="PREPARING">
                    <i class="bi bi-box-seam"></i> Xác nhận & chuẩn bị
                </button>
                <button type="button" class="danger" data-order-cancel="${Number(orderId)}" data-cancel-actor="admin">
                    <i class="bi bi-x-circle"></i> Hủy đơn
                </button>
            </div>
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

    if (status === CANCELLED_FULFILLMENT_STATUS) {
        return '<small class="cancelled"><i class="bi bi-x-circle-fill"></i> Đơn đã hủy</small>';
    }

    return '<small><i class="bi bi-check-circle-fill"></i> Đơn đã hoàn tất</small>';
}

function getAdminRefundAction(order) {
    const refundStatus = normalizeOrderRefundStatus(order?.refundStatus || order?.refund?.status);
    if (!isRefundableCanceledPaidOrder(order) && refundStatus === 'NONE') return '';

    if (['PENDING', 'FAILED'].includes(refundStatus)) {
        const label = refundStatus === 'FAILED' ? 'Thử hoàn tiền lại' : 'Xác nhận hoàn tiền';
        return `
            <div class="admin-order-actions">
                <button type="button" data-order-refund="${Number(order.id)}">
                    <i class="bi bi-arrow-counterclockwise"></i> ${label}
                </button>
            </div>
            ${renderOrderRefundState(order)}
        `;
    }

    return renderOrderRefundState(order);
}

function renderOrderRefundState(order) {
    const refundStatus = normalizeOrderRefundStatus(order?.refundStatus || order?.refund?.status);
    if (refundStatus === 'NONE') return '';

    const tone = refundStatus === 'REFUNDED'
        ? 'success'
        : refundStatus === 'FAILED'
            ? 'danger'
            : 'warning';
    const reference = order?.refund?.reference
        ? `<small>${escapeHtml(order.refund.reference)}</small>`
        : '';

    return `
        <div class="order-return-state notification-${tone}">
            <strong>${escapeHtml(getOrderRefundLabel(refundStatus))}</strong>
            ${reference}
        </div>
    `;
}

function isRefundableCanceledPaidOrder(order) {
    if (normalizeOrderFulfillmentStatus(order?.fulfillmentStatus) !== CANCELLED_FULFILLMENT_STATUS) return false;
    if (!isPaidOrderStatus(order?.status)) return false;

    const refundStatus = normalizeOrderRefundStatus(order?.refundStatus || order?.refund?.status);
    return ['NONE', 'PENDING', 'FAILED'].includes(refundStatus);
}

function normalizeOrderRefundStatus(value) {
    const normalized = String(value || '').toUpperCase();
    return ['NONE', 'PENDING', 'PROCESSING', 'REFUNDED', 'FAILED'].includes(normalized)
        ? normalized
        : 'NONE';
}

function isPaidOrderStatus(status) {
    return ['PAID', 'PAID_AFTER_CANCEL'].includes(String(status || '').toUpperCase());
}

function getOrderRefundLabel(status) {
    const labels = {
        PENDING: 'Chờ admin xác nhận hoàn tiền',
        PROCESSING: 'Đang hoàn tiền tự động',
        REFUNDED: 'Đã hoàn tiền',
        FAILED: 'Hoàn tiền thất bại'
    };
    return labels[normalizeOrderRefundStatus(status)] || '';
}

function getRefundSuccessToast(order) {
    const status = normalizeOrderRefundStatus(order?.refundStatus || order?.refund?.status);
    if (status === 'REFUNDED') return 'Đã hoàn tiền thành công.';
    if (status === 'PROCESSING') return 'Đã tạo lệnh hoàn tiền, payOS đang xử lý.';
    return 'Đã cập nhật trạng thái hoàn tiền.';
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
                ...getProfileAddressPayload()
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
        adminMessage.textContent = contentText('messages.admin.needAdmin', 'Bạn cần đăng nhập bằng tài khoản quản trị viên.');
        return;
    }

    const id = document.getElementById('adminProductId').value;
    const category = document.getElementById('adminCategory').value;
    const sizes = splitList(document.getElementById('adminSizes').value);
    const colors = splitList(document.getElementById('adminColors')?.value);
    const stockInput = document.getElementById('adminStock').value;
    const images = splitImageList(document.getElementById('adminImage').value);
    const price = Number(document.getElementById('adminPrice').value);
    const variantPricesInput = document.getElementById('adminVariantPrices')?.value || '';
    const payload = {
        description: document.getElementById('adminDescription').value,
        name: document.getElementById('adminName').value,
        category,
        displayCategory: displayCategoryFromType(category),
        price,
        salePercent: Number(document.getElementById('adminSalePercent').value) || 0,
        image: images[0] || '',
        images: images.slice(1),
        sizes,
        colors,
        stock: colors.length ? {} : parseStock(stockInput),
        variantStock: colors.length ? parseVariantStock(stockInput, colors, sizes) : {},
        variantPrices: parseVariantPrices(variantPricesInput, colors, sizes),
        totalStock: sizes.length || colors.length ? null : parseTotalStock(stockInput),
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
        renderSearch(searchInput?.value || '');
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
            <td>${renderPrice(product)}${formatVariantPriceSummary(product) ? `<small>${escapeHtml(formatVariantPriceSummary(product))}</small>` : ''}</td>
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
    document.getElementById('adminDescription').value = product.description || '';
    document.getElementById('adminName').value = product.name;
    document.getElementById('adminCategory').value = product.category;
    document.getElementById('adminPrice').value = product.price;
    document.getElementById('adminSalePercent').value = getProductSalePercent(product);
    document.getElementById('adminImage').value = getProductImages(product).join('\n');
    document.getElementById('adminSizes').value = getProductSizes(product).join(',');
    const adminColors = document.getElementById('adminColors');
    if (adminColors) adminColors.value = getProductColors(product).join(',');
    document.getElementById('adminStock').value = formatStock(product);
    const adminVariantPrices = document.getElementById('adminVariantPrices');
    if (adminVariantPrices) adminVariantPrices.value = formatVariantPrices(product);
    document.getElementById('adminSection').value = product.section || 'products';
    adminMessage.textContent = contentText('messages.admin.editing', 'Đang sửa sản phẩm.');
    updateAdminImagePreview();
    adminPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        renderSearch(searchInput?.value || '');
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
        displayCategory: card?.dataset.category || 'Phụ kiện',
        price: Number(button?.dataset.price || card?.dataset.price || 0),
        sizes: [],
        stock: {}
    };
}

function requiresSize(product) {
    return ['shoes', 'clothing'].includes(product.category) || getProductSizes(product).length > 0;
}

function canAddQuantity(product, size, color, currentQuantity) {
    if (getProductColors(product).length && !color) return false;
    if (requiresSize(product) && !size) return false;

    if (!getProductColors(product).length && !requiresSize(product)) {
        const totalStock = getProductTotalStock(product);
        return totalStock === null || currentQuantity + 1 <= totalStock;
    }

    return currentQuantity + 1 <= getVariantStock(product, color, size);
}

function getProductSizes(product) {
    return Array.isArray(product.sizes) ? product.sizes.map((size) => String(size)) : [];
}

function getProductColors(product) {
    return Array.isArray(product.colors)
        ? product.colors.map((color) => String(color).trim()).filter(Boolean)
        : [];
}

function getVariantStock(product, color, size) {
    const colors = getProductColors(product);
    if (colors.length) {
        const sizeKey = size || '__default__';
        return Math.max(0, Number(product.variantStock?.[color]?.[sizeKey]) || 0);
    }

    if (size) {
        return Math.max(0, Number(product.stock?.[String(size)]) || 0);
    }

    const totalStock = getProductTotalStock(product);
    return totalStock === null ? Number.MAX_SAFE_INTEGER : totalStock;
}

function getColorTotalStock(product, color) {
    const sizes = getProductSizes(product);
    if (!sizes.length) return getVariantStock(product, color, '');
    return sizes.reduce((sum, size) => sum + getVariantStock(product, color, size), 0);
}

function getSizeTotalStock(product, size) {
    const colors = getProductColors(product);
    if (!colors.length) return getVariantStock(product, '', size);
    return colors.reduce((sum, color) => sum + getVariantStock(product, color, size), 0);
}

function getProductTotalStock(product) {
    if (product.totalStock === null || product.totalStock === undefined || product.totalStock === '') {
        return null;
    }

    const totalStock = Number(product.totalStock);
    return Number.isFinite(totalStock) ? Math.max(0, totalStock) : null;
}

function getProductBasePrice(product, color = '', size = '') {
    const fallback = Math.max(0, Math.round(Number(product?.price) || 0));
    const variantPrices = product?.variantPrices;
    if (!variantPrices || typeof variantPrices !== 'object' || Array.isArray(variantPrices)) {
        return fallback;
    }

    const colors = getProductColors(product);
    const sizes = getProductSizes(product);
    if (!colors.length && !sizes.length) return fallback;

    const colorKey = colors.length ? String(color || '').trim() : '__default__';
    const sizeKey = sizes.length ? String(size || '').trim() : '__default__';
    const price = Number(variantPrices?.[colorKey]?.[sizeKey]);

    return Number.isFinite(price) && price >= 0 ? Math.round(price) : fallback;
}

function getProductSalePercent(product) {
    const salePercent = Number(product?.salePercent) || 0;
    if (!Number.isFinite(salePercent)) return 0;
    return Math.min(95, Math.max(0, Math.trunc(salePercent)));
}

function getProductSalePrice(product, color = '', size = '') {
    const basePrice = getProductBasePrice(product, color, size);
    const salePercent = getProductSalePercent(product);
    if (!salePercent) return basePrice;
    return Math.max(0, Math.round(basePrice * (100 - salePercent) / 100));
}

function renderPrice(product, color = '', size = '') {
    const salePercent = getProductSalePercent(product);
    const basePrice = getProductBasePrice(product, color, size);
    const salePrice = getProductSalePrice(product, color, size);

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
    if (category === 'shoes') return 'Giày sneaker';
    if (category === 'clothing') return 'Quần áo';
    return 'Phụ kiện';
}

function productTypeFromDisplay(displayCategory) {
    const normalized = String(displayCategory || '').toLowerCase();
    if (['sneaker', 'giày sneaker'].includes(normalized)) return 'shoes';
    if (['apparel', 'áo', 'áo thể thao', 'quần áo'].includes(normalized)) return 'clothing';
    return 'accessory';
}

function getRoleLabel(role) {
    return role === 'Admin' ? 'Quản trị viên' : 'Thành viên';
}

function getProductDescription(product) {
    if (product?.description) return String(product.description);

    const category = product?.displayCategory || 'sản phẩm';
    const sizeInfo = getProductSizes(product).length
        ? `Có các kích cỡ ${getProductSizes(product).join(', ')}.`
        : 'Phù hợp dùng hằng ngày, dễ phối với nhiều trang phục.';

    return `${product?.name || 'Sản phẩm'} thuộc nhóm ${category}, được kiểm tra tồn kho và tình trạng trước khi giao. ${sizeInfo}`;
}

function getStockSummary(product) {
    const colors = getProductColors(product);
    if (colors.length) {
        const variants = colors.flatMap((color) => {
            const sizes = getProductSizes(product);
            if (!sizes.length) return [`${color}: ${getVariantStock(product, color, '')}`];
            return sizes.map((size) => `${color}/${size}: ${getVariantStock(product, color, size)}`);
        });
        return `${contentText('labels.stock', 'Tồn kho')}: ${variants.join(', ')}`;
    }

    if (requiresSize(product)) {
        const available = getProductSizes(product)
            .map((size) => `${size}: ${Number(product.stock?.[String(size)] || 0)}`)
            .join(', ');
        return available
            ? `${contentText('labels.stock', 'Tồn kho')}: ${available}`
            : contentText('messages.cart.sizeSoldOut', 'Kích cỡ này tạm hết hàng');
    }

    const totalStock = getProductTotalStock(product);
    if (totalStock === null) return contentText('labels.stockUnlimited', 'Không giới hạn');
    return `${contentText('labels.stock', 'Tồn kho')}: ${totalStock}`;
}

function isProductOutOfStock(product) {
    const colors = getProductColors(product);
    if (colors.length) {
        return colors.every((color) => getColorTotalStock(product, color) <= 0);
    }

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

function splitImageList(value) {
    return Array.from(new Set(
        String(value || '')
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean)
    ));
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

function parseVariantStock(value, colors, sizes) {
    const sizeKeys = sizes.length ? sizes : ['__default__'];
    const result = colors.reduce((stock, color) => {
        stock[color] = sizeKeys.reduce((entries, size) => {
            entries[size] = 0;
            return entries;
        }, {});
        return stock;
    }, {});

    String(value || '')
        .split(/[\r\n,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .forEach((entry) => {
            const separator = entry.lastIndexOf(':');
            if (separator < 0) return;

            const variant = entry.slice(0, separator).trim();
            const quantity = Math.max(0, Number(entry.slice(separator + 1).trim()) || 0);
            const [color, rawSize = '-'] = variant.split('|').map((part) => part.trim());
            const size = !rawSize || rawSize === '-' ? '__default__' : rawSize;

            if (result[color] && Object.prototype.hasOwnProperty.call(result[color], size)) {
                result[color][size] = quantity;
            }
        });

    return result;
}

function parseVariantPrices(value, colors, sizes) {
    const text = String(value || '').trim();
    if (!text || (!colors.length && !sizes.length)) return {};

    const colorKeys = colors.length ? colors : ['__default__'];
    const sizeKeys = sizes.length ? sizes : ['__default__'];
    const result = {};

    text
        .split(/[\r\n,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .forEach((entry) => {
            const separator = entry.lastIndexOf(':');
            if (separator < 0) return;

            const variant = entry.slice(0, separator).trim();
            const price = Math.max(0, Math.round(Number(entry.slice(separator + 1).trim()) || 0));
            const [rawColor = '-', rawSize = '-'] = variant.split('|').map((part) => part.trim());
            const color = colors.length ? rawColor : '__default__';
            const size = sizes.length ? rawSize : '__default__';

            if (!colorKeys.includes(color) || !sizeKeys.includes(size)) return;
            if (!result[color]) result[color] = {};
            result[color][size] = price;
        });

    return result;
}

function parseTotalStock(value) {
    const totalStock = Number(String(value || '').trim());
    return Number.isFinite(totalStock) ? Math.max(0, Math.trunc(totalStock)) : null;
}

function formatVariantPrices(product) {
    const colors = getProductColors(product);
    const sizes = getProductSizes(product);
    const variantPrices = product?.variantPrices;
    if (!variantPrices || typeof variantPrices !== 'object' || Array.isArray(variantPrices)) return '';

    const basePrice = Math.max(0, Math.round(Number(product?.price) || 0));
    const colorValues = colors.length ? colors : ['__default__'];
    const sizeValues = sizes.length ? sizes : ['__default__'];

    return colorValues.flatMap((color) => {
        return sizeValues.map((size) => {
            const price = Number(variantPrices?.[color]?.[size]);
            if (!Number.isFinite(price) || Math.round(price) === basePrice) return '';

            const displayColor = colors.length ? color : '-';
            const displaySize = sizes.length ? size : '-';
            return `${displayColor}|${displaySize}:${Math.round(price)}`;
        });
    }).filter(Boolean).join(', ');
}

function formatVariantPriceSummary(product) {
    const text = formatVariantPrices(product);
    return text ? `Biến thể: ${text}` : '';
}

function formatStock(product) {
    const colors = getProductColors(product);
    if (colors.length) {
        const sizes = getProductSizes(product);
        return colors.flatMap((color) => {
            if (!sizes.length) {
                return [`${color}|-:${getVariantStock(product, color, '')}`];
            }
            return sizes.map((size) => `${color}|${size}:${getVariantStock(product, color, size)}`);
        }).join(', ');
    }

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
    localStorage.setItem(getCartKey(), JSON.stringify(cart));
    queueCartSync();
}

function loadCart() {
    return loadJson(getCartKey(), []).map(normalizeCartItem).filter(Boolean);
}

async function loadCartForCurrentUser() {
    cart = loadCart();
    renderCart();

    if (!currentUser?.token) return cart;

    try {
        const response = await fetch('/api/cart/me', {
            headers: authHeaders(false)
        });
        const data = await response.json();

        if (!response.ok || !Array.isArray(data.items)) return cart;

        cart = data.items.map(normalizeCartItem).filter(Boolean);
        localStorage.setItem(getCartKey(), JSON.stringify(cart));
        renderCart();
        return cart;
    } catch {
        return cart;
    }
}

function queueCartSync() {
    if (!currentUser?.token) return;

    if (cartSyncTimer) {
        window.clearTimeout(cartSyncTimer);
    }

    cartSyncTimer = window.setTimeout(() => {
        cartSyncTimer = null;
        persistCartToServer();
    }, 250);
}

async function persistCartToServer() {
    if (!currentUser?.token) return;

    try {
        const response = await fetch('/api/cart/me', {
            method: 'PUT',
            headers: authHeaders(true),
            body: JSON.stringify({ items: getCheckoutItems() })
        });
        const data = await response.json();

        if (!response.ok || !Array.isArray(data.items)) return;

        cart = data.items.map(normalizeCartItem).filter(Boolean);
        localStorage.setItem(getCartKey(), JSON.stringify(cart));
        renderCart();
    } catch {
        // Local cart remains usable; the next cart change will try syncing again.
    }
}

function getCartKey() {
    const userKey = getCurrentUserCartKey();
    return userKey ? `${CART_KEY}:user:${userKey}` : CART_KEY;
}

function getCurrentUserCartKey() {
    if (!currentUser?.token) return '';

    const id = Number(currentUser.id);
    if (Number.isInteger(id) && id > 0) return String(id);

    return String(currentUser.username || '').trim().toLowerCase();
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
        color: item.color === null || item.color === undefined ? null : String(item.color),
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

function getSelectedOptionText(select) {
    if (!select || !select.value) return '';
    return select.selectedOptions?.[0]?.textContent?.trim() || '';
}

function getProfileAddressPayload() {
    const province = getSelectedOptionText(profileProvince);
    const commune = getSelectedOptionText(profileWard);
    const streetAddress = profileStreetAddress?.value?.trim() || '';
    const address = [streetAddress, commune, province].filter(Boolean).join(', ');

    return {
        address,
        province,
        commune,
        streetAddress
    };
}

function parseProfileAddress(address = '') {
    const parts = String(address).split(',').map((part) => part.trim()).filter(Boolean);

    if (parts.length < 3) {
        return {
            streetAddress: String(address || '').trim(),
            commune: '',
            province: ''
        };
    }

    return {
        streetAddress: parts.slice(0, -2).join(', '),
        commune: parts[parts.length - 2],
        province: parts[parts.length - 1]
    };
}

function selectOptionByText(select, text) {
    if (!select || !text) return false;

    const normalizedText = String(text).trim().toLowerCase();
    const option = Array.from(select.options).find((entry) =>
        entry.textContent.trim().toLowerCase() === normalizedText
    );

    if (!option) return false;

    select.value = option.value;
    return true;
}

function fillProfileAddressFields(address = '') {
    if (!profileStreetAddress) return;

    const parsedAddress = parseProfileAddress(address);
    profileStreetAddress.value = parsedAddress.streetAddress;

    if (!addressProvinceData.length || !profileProvince || !profileWard) return;

    if (selectOptionByText(profileProvince, parsedAddress.province)) {
        populateWardOptions(profileProvince.value);
        selectOptionByText(profileWard, parsedAddress.commune);
    }
}


const provinceSelect = document.getElementById("province");
const wardSelect = document.getElementById("ward");
let addressProvinceData = [];

function populateWardOptions(provinceCode) {
    if (!wardSelect) return;

    const province =
        addressProvinceData.find(p => p.code === Number(provinceCode));

    wardSelect.innerHTML =
        '<option value="">Chọn phường/xã</option>';

    if (!province) return;

    province.districts.forEach(district => {

        district.wards.forEach(ward => {

            wardSelect.innerHTML += `
                        <option value="${ward.name}">
                            ${ward.name}
                        </option>
                    `;

        });

    });
}

if (provinceSelect && wardSelect) {
    fetch("https://provinces.open-api.vn/api/v1/?depth=3")
        .then(res => res.json())
        .then(data => {
            addressProvinceData = data;

            data.forEach(province => {
                provinceSelect.innerHTML += `
                <option value="${province.code}">
                    ${province.name}
                </option>
            `;
            });

            provinceSelect.addEventListener("change", () => {

                const province =
                    data.find(p => p.code === Number(provinceSelect.value));

                wardSelect.innerHTML =
                    '<option value="">Chọn phường/xã</option>';

                if (!province) return;

                province.districts.forEach(district => {

                    district.wards.forEach(ward => {

                        wardSelect.innerHTML += `
                        <option value="${ward.name}">
                            ${ward.name}
                        </option>
                    `;

                    });

                });

            });

            fillProfileAddressFields(currentUser?.address || '');

        });
}


function getFullAddress() {
    return getProfileAddressPayload().address;
}
