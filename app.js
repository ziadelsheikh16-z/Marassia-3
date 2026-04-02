'use strict';


/* ════ ANTHROPIC API KEY MANAGER ════ */

function checkApiStatus() {
    var el = document.getElementById('api-status');
    if (!el) return;
    var hasKey = !!_getApiKey();
    el.classList.toggle('ready', hasKey);
    el.title = hasKey
        ? '✅ API Key مضبوط — الترجمة والذكاء الاصطناعي شغّالين'
        : '⚠️ API Key غير مضبوط — أضفه من الأدمن ← إعدادات';
}

function _getApiKey() {
    // Priority: db.settings → localStorage → empty
    if (db.settings && db.settings.apiKey && db.settings.apiKey.trim())
        return db.settings.apiKey.trim();
    var stored = localStorage.getItem('marassia_api_key');
    if (stored && stored.trim()) return stored.trim();
    return '';
}

function _apiFetch(body) {
    var key = _getApiKey();
    if (!key) {
        showToast('⚠️ أضف API Key من لوحة التحكم ← AI & API', 'error');
        return Promise.reject(new Error('NO_API_KEY'));
    }
    var provider = (db.settings && db.settings.aiProvider) || 'gemini';
    if (provider === 'gemini' || key.startsWith('AIza')) {
        return _apiFetchGemini(body, key).then(function(data){
            // Wrap in fake Response object for compatibility
            return { ok:true, json:function(){ return Promise.resolve(data); } };
        });
    }
    // Anthropic via Netlify proxy
    var isLive = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    if (isLive) {
        return fetch('/.netlify/functions/ai-chat', {
            method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)
        });
    }
    return fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify(body)
    });
}
/* ─────────────────────────────────────────
   1. SECURITY — XSS Protection
───────────────────────────────────────── */
const sanitize = (str) => {
    if (str === null || str === undefined) return '';
    return String(str).slice(0,2000)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#039;')
        .replace(/`/g,'&#x60;');
};
const sanitizeNum = (val,max=9999999) => { const n=parseFloat(val); return (!isNaN(n)&&n>=0&&n<=max)?n:0; };

const safeUrl = (url) => {
    if (!url||typeof url!=='string') return '';
    const t=url.trim();
    if(/^https:\/\/.{4,2048}/.test(t)) return t;  // https only
    if(/^data:image\/(jpeg|png|webp|gif);base64,/.test(t)) return t; // local compressed images
    return '';
};

/* ─────────────────────────────────────────
   2. IMAGE COMPRESSION ENGINE
───────────────────────────────────────── */
function compressImage(file, callback) {
    // Aggressive compression: max 400px, quality 0.60 → target <80KB
    var MAX_W = 400, MAX_H = 400;
    var reader = new FileReader();
    reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
            var scale = Math.min(1, MAX_W / img.width, MAX_H / img.height);
            var w = Math.round(img.width * scale);
            var h = Math.round(img.height * scale);
            var canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            // Try WebP first (smaller), fallback to JPEG
            var quality = 0.60;
            var dataUrl = canvas.toDataURL('image/webp', quality);
            if (dataUrl.length < 100 || dataUrl.indexOf('data:image/webp') < 0) {
                dataUrl = canvas.toDataURL('image/jpeg', quality);
            }
            // If still too large (>150KB base64 ≈ 112KB binary), compress more
            if (dataUrl.length > 200000) {
                quality = 0.40;
                dataUrl = canvas.toDataURL('image/jpeg', quality);
            }
            var kb = Math.round(dataUrl.length * 0.75 / 1024);
            showToast('📸 صورة محفوظة: ' + kb + ' KB' + (kb > 100 ? ' (كبيرة — يُنصح برابط URL)' : ''), 'info');
            callback(dataUrl);
        };
        img.onerror = function() { callback(''); };
        img.src = e.target.result;
    };
    reader.onerror = function() { callback(''); };
    reader.readAsDataURL(file);
}


/* ═══════════════════════════════════════════════════════════
   i18n — Multi-Language Engine
   Supports: ar / en / fr / es / it / de / zh
═══════════════════════════════════════════════════════════ */

const LANGS = {
    ar: {
        dir:'rtl', label:'AR', font:'Cairo',
        catNames:{'الكل':'الكل','Kitchen Finds':'مستلزمات المطبخ','Home Finds':'مستلزمات المنزل','آثاث':'آثاث','إلكترونيات':'إلكترونيات','اكسسوارات إلكترونيات':'اكسسوارات تك','صحة وتجميل':'صحة وتجميل','ملابس رجالي':'ملابس رجالي','ملابس حريمي':'ملابس حريمي','ملابس أطفال بناتي':'ملابس بنات','ملابس أطفال ولادي':'ملابس أولاد','ساعات':'ساعات','مجوهرات وإكسسوارات':'مجوهرات وإكسسوارات','حقائب':'حقائب','طبي ودواء':'طبي ودواء'}, catAll:'الكل',
        login:'تسجيل الدخول', logout:'خروج', member:'عضو MARASSiA',
        myHistory:'سجلي', ourStore:'متجرنا', ourBlog:'مدونتنا',
        aboutUs:'من نحن', followUs:'تابعنا على', home:'الرئيسية',
        searchPlaceholder:'ابحث...', historyTitle:'سجل مشترياتي',
        logoutTitle:'تسجيل الخروج', loginTitle:'تسجيل الدخول', cartTitle:'سلة المشتريات',
        trending:'الأكثر رواجاً', bestSellers:'الأكثر مبيعاً',
        allProducts:'جميع المنتجات', backToBlog:'العودة للمدونة', ourStory:'قصتنا ومبادئنا',
        cart:'سلة المشتريات', total:'الإجمالي:', sendOrder:'تأكيد وإرسال الطلب عبر واتساب',
        cartEmpty:'سلتك فارغة — أضف منتجاً!', currency:'ج.م',
        email:'البريد الإلكتروني', loginBtn:'دخول / تسجيل', purchaseHistory:'سجل مشترياتي',
        addToCart:'أضف للسلة', buyFromAgent:'شراء من الوكيل',
        noProducts:'لا توجد منتجات بعد', noCatProducts:'القسم فارغ حالياً', soldCount:'مبيعة',
        shelfEmpty:'لا توجد منتجات بعد',
        historyEmpty:'سجلك فارغ بعد!', historyEmptySub:'ما تشتريش تبقى في السجل 😊',
        order:'طلب', readMore:'اقرأ المزيد', noBlog:'لا توجد مقالات بعد',
        productsInCat:'منتج في هذا القسم', rights:'جميع الحقوق محفوظة',
        welcome:'أهلاً بك يا', loggedOut:'تم تسجيل الخروج بنجاح',
        invalidEmail:'أدخل بريد إلكتروني صحيح', addedToCart:'تمت الإضافة للسلة 🛍️',
        noWhatsapp:'لم يُضبط رقم الواتساب بعد!',
        choosePayment:'اختر طريقة الدفع',
        payWhatsapp:'واتساب', payWhatsappSub:'تأكيد عبر واتساب',
        payCard:'كارت بنكي', payCardSub:'Visa / Mastercard / Amex',
        payInstapay:'InstaPay', payInstapaySub:'تحويل فوري',
        payVodafone:'Vodafone Cash', payVodafoneSub:'محفظة فودافون',
        sendToNumber:'حوّل المبلغ على الرقم التالي:',
        sendScreenshot:'ثم أرسل إيصال التحويل على الواتساب',
        orderConfirmed:'تم تأكيد طلبك! سيتواصل معك الفريق قريباً ✅',
        cartEmptyErr:'السلة فارغة!', fillCardData:'أكمل بيانات الكارت أولاً',
        cardOrderSent:'تم استلام طلبك 🎉 سيتم التواصل معك لتأكيد الدفع',
        tabProducts:'المنتجات', tabBlog:'المدونة', tabHero:'الواجهة',
        tabCats:'الأقسام', tabAbout:'من نحن', tabSocial:'السوشيال', tabSettings:'الإعدادات',
        adminPanel:'لوحة تحكم', saveClose:'حفظ وإغلاق', cancel:'إلغاء',
        settingsSaved:'تم تحديث الإعدادات ⚙️', socialSaved:'تم تحديث السوشيال 🌐',
        catAdded:'تم إضافة القسم ✓',
        catExists:'القسم موجود بالفعل!',
        catNameEmpty:'اسم القسم مطلوب!', catDeleted:'تم حذف القسم',
        heroSaved:'تم حفظ الواجهة ✓', productSaved:'تم نشر المنتج ✓',
        productDeleted:'تم حذف المنتج', blogSaved:'تم نشر المقالة ✓',
        blogDeleted:'تم حذف المقالة', aboutSaved:'تم حفظ من نحن ✓',
        firebaseConnected:'متصل بقاعدة البيانات 🔥',
        securePayment:'دفع آمن ومشفّر 🔒', sslProtected:'محمي بـ SSL 256-bit',
        cardholderName:'الاسم على الكارت', cardNumber:'رقم الكارت',
        expiryDate:'تاريخ الانتهاء', cvv:'CVV',
        cardBrands:'Visa / Mastercard / Amex',
    },
    en: {
        dir:'ltr', label:'EN', font:'Cairo',
        catNames:{'الكل':'All','Kitchen Finds':'Kitchen Finds','Home Finds':'Home Finds','آثاث':'Furniture','إلكترونيات':'Electronics','اكسسوارات إلكترونيات':'Tech Accessories','صحة وتجميل':'Health and Beauty','ملابس رجالي':'Mens Fashion','ملابس حريمي':'Womens Fashion','ملابس أطفال بناتي':'Girls Clothing','ملابس أطفال ولادي':'Boys Clothing','ساعات':'Watches','مجوهرات وإكسسوارات':'Jewelry and Accessories','حقائب':'Bags and Luggage','طبي ودواء':'Medical & Pharma'}, catAll:'All',
        login:'Sign In', logout:'Logout', member:'MARASSiA Member',
        myHistory:'My Orders', ourStore:'Our Store', ourBlog:'Our Blog',
        aboutUs:'About Us', followUs:'Follow us on', home:'Home',
        searchPlaceholder:'Search...', historyTitle:'My Purchase History',
        logoutTitle:'Sign Out', loginTitle:'Sign In', cartTitle:'Shopping Bag',
        trending:'Trending Now', bestSellers:'Best Sellers',
        allProducts:'All Products', backToBlog:'Back to Blog', ourStory:'Our Story & Values',
        cart:'Shopping Bag', total:'Total:', sendOrder:'Confirm & Order via WhatsApp',
        cartEmpty:'Your bag is empty — add something!', currency:'EGP',
        email:'Email Address', loginBtn:'Login / Register', purchaseHistory:'Purchase History',
        addToCart:'Add to Cart', buyFromAgent:'Buy from Seller',
        noProducts:'No products yet', noCatProducts:'No products in this category', soldCount:'sold',
        shelfEmpty:'No products yet',
        historyEmpty:'No orders yet!', historyEmptySub:'Your order history is empty 😊',
        order:'Order', readMore:'Read More', noBlog:'No articles yet',
        productsInCat:'products in this category', rights:'All Rights Reserved',
        welcome:'Welcome,', loggedOut:'Logged out successfully',
        invalidEmail:'Please enter a valid email', addedToCart:'Added to bag 🛍️',
        noWhatsapp:'WhatsApp number not set!',
        choosePayment:'Choose Payment Method',
        payWhatsapp:'WhatsApp', payWhatsappSub:'Confirm via WhatsApp',
        payCard:'Bank Card', payCardSub:'Visa / Mastercard / Amex',
        payInstapay:'InstaPay', payInstapaySub:'Instant Transfer',
        payVodafone:'Vodafone Cash', payVodafoneSub:'Vodafone Wallet',
        sendToNumber:'Transfer amount to:', sendScreenshot:'Send receipt on WhatsApp',
        orderConfirmed:'Order confirmed! Our team will contact you ✅',
        cartEmptyErr:'Cart is empty!', fillCardData:'Please fill card details',
        cardOrderSent:'Order received 🎉 We will contact you to confirm payment',
        tabProducts:'Products', tabBlog:'Blog', tabHero:'Hero Banner',
        tabCats:'Categories', tabAbout:'About Us', tabSocial:'Social', tabSettings:'Settings',
        adminPanel:'Control Panel', saveClose:'Save & Close', cancel:'Cancel',
        settingsSaved:'Settings updated ⚙️', socialSaved:'Social links updated 🌐',
        catAdded:'Category added ✓',
        catExists:'Category already exists!',
        catNameEmpty:'Category name required!', catDeleted:'Category deleted',
        heroSaved:'Hero saved ✓', productSaved:'Product published ✓',
        productDeleted:'Product deleted', blogSaved:'Article published ✓',
        blogDeleted:'Article deleted', aboutSaved:'About Us saved ✓',
        firebaseConnected:'Connected to database 🔥',
        securePayment:'Secure & Encrypted Payment 🔒', sslProtected:'Protected by SSL 256-bit',
        cardholderName:'Cardholder Name', cardNumber:'Card Number',
        expiryDate:'Expiry Date', cvv:'CVV',
        cardBrands:'Visa / Mastercard / Amex',
    },
    fr: {
        dir:'ltr', label:'FR', font:'Cairo',
        catNames:{'الكل':'Tous','Kitchen Finds':'Cuisine','Home Finds':'Maison','آثاث':'Mobilier','إلكترونيات':'Électronique','اكسسوارات إلكترونيات':'Accessoires Tech','صحة وتجميل':'Santé & Beauté','ملابس رجالي':'Mode Homme','ملابس حريمي':'Mode Femme','ملابس أطفال بناتي':'Vêtements filles','ملابس أطفال ولادي':'Vêtements garçons','ساعات':'Montres','مجوهرات وإكسسوارات':'Bijoux','حقائب':'Sacs','طبي ودواء':'Médical'}, catAll:'Tous',
        login:'Connexion', logout:'Déconnexion', member:'Membre MARASSiA',
        myHistory:'Mes commandes', ourStore:'Notre boutique', ourBlog:'Notre blog',
        aboutUs:'À propos', followUs:'Suivez-nous sur', home:'Accueil',
        searchPlaceholder:'Rechercher...', historyTitle:'Historique',
        logoutTitle:'Déconnexion', loginTitle:'Connexion', cartTitle:'Panier',
        trending:'Tendances', bestSellers:'Meilleures ventes',
        allProducts:'Tous les produits', backToBlog:'Retour au blog', ourStory:'Notre histoire',
        cart:'Panier', total:'Total :', sendOrder:'Commander via WhatsApp',
        cartEmpty:'Votre panier est vide!', currency:'EGP',
        email:'Adresse e-mail', loginBtn:'Connexion / Inscription', purchaseHistory:'Historique',
        addToCart:'Ajouter au panier', buyFromAgent:'Acheter chez le vendeur',
        noProducts:'Aucun produit', noCatProducts:'Aucun produit dans cette catégorie', soldCount:'vendus',
        shelfEmpty:'Aucun produit',
        historyEmpty:'Aucune commande!', historyEmptySub:'Votre historique est vide 😊',
        order:'Commande', readMore:'Lire la suite', noBlog:'Aucun article',
        productsInCat:'produits dans cette catégorie', rights:'Tous droits réservés',
        welcome:'Bienvenue,', loggedOut:'Déconnecté avec succès',
        invalidEmail:'Entrez une adresse e-mail valide', addedToCart:'Ajouté au panier 🛍️',
        noWhatsapp:'Numéro WhatsApp non défini!',
        choosePayment:'Mode de paiement',
        payWhatsapp:'WhatsApp', payWhatsappSub:'Confirmer via WhatsApp',
        payCard:'Carte bancaire', payCardSub:'Visa / Mastercard / Amex',
        payInstapay:'InstaPay', payInstapaySub:'Virement instantané',
        payVodafone:'Vodafone Cash', payVodafoneSub:'Portefeuille Vodafone',
        sendToNumber:'Transférer au:', sendScreenshot:'Envoyer reçu sur WhatsApp',
        orderConfirmed:'Commande confirmée! ✅', cartEmptyErr:'Panier vide!',
        fillCardData:'Remplir données carte', cardOrderSent:'Commande reçue 🎉',
        tabProducts:'Produits', tabBlog:'Blog', tabHero:'Bannière',
        tabCats:'Catégories', tabAbout:'À propos', tabSocial:'Réseaux', tabSettings:'Paramètres',
        adminPanel:'Panneau admin', saveClose:'Sauvegarder', cancel:'Annuler',
        settingsSaved:'Paramètres mis à jour ⚙️', socialSaved:'Liens mis à jour 🌐',
        catAdded:'Catégorie ajoutée ✓',
        catExists:'Catégorie déjà existante!',
        catNameEmpty:'Nom requis!', catDeleted:'Catégorie supprimée',
        heroSaved:'Bannière sauvegardée ✓', productSaved:'Produit publié ✓',
        productDeleted:'Produit supprimé', blogSaved:'Article publié ✓',
        blogDeleted:'Article supprimé', aboutSaved:'À propos sauvegardé ✓',
        firebaseConnected:'Connecté à la base de données 🔥',
        securePayment:'Paiement sécurisé et chiffré 🔒', sslProtected:'Protégé par SSL 256-bit',
        cardholderName:'Nom sur la carte', cardNumber:'Numéro de carte',
        expiryDate:"Date d'expiration", cvv:'CVV',
        cardBrands:'Visa / Mastercard / Amex',
    },
    es: {
        dir:'ltr', label:'ES', font:'Cairo',
        catNames:{'الكل':'Todo','Kitchen Finds':'Cocina','Home Finds':'Hogar','آثاث':'Muebles','إلكترونيات':'Electrónica','اكسسوارات إلكترونيات':'Accesorios Tech','صحة وتجميل':'Salud & Belleza','ملابس رجالي':'Moda Hombre','ملابس حريمي':'Moda Mujer','ملابس أطفال بناتي':'Niñas','ملابس أطفال ولادي':'Niños','ساعات':'Relojes','مجوهرات وإكسسوارات':'Joyería','حقائب':'Bolsos','طبي ودواء':'Médico'}, catAll:'Todo',
        login:'Iniciar sesión', logout:'Cerrar sesión', member:'Miembro MARASSiA',
        myHistory:'Mis pedidos', ourStore:'Nuestra tienda', ourBlog:'Nuestro blog',
        aboutUs:'Sobre nosotros', followUs:'Síguenos en', home:'Inicio',
        searchPlaceholder:'Buscar...', historyTitle:'Historial',
        logoutTitle:'Cerrar sesión', loginTitle:'Iniciar sesión', cartTitle:'Carrito',
        trending:'Tendencias', bestSellers:'Más vendidos',
        allProducts:'Todos los productos', backToBlog:'Volver al blog', ourStory:'Nuestra historia',
        cart:'Carrito', total:'Total:', sendOrder:'Pedir por WhatsApp',
        cartEmpty:'Tu carrito está vacío!', currency:'EGP',
        email:'Correo electrónico', loginBtn:'Entrar / Registrarse', purchaseHistory:'Historial',
        addToCart:'Añadir al carrito', buyFromAgent:'Comprar al vendedor',
        noProducts:'Sin productos', noCatProducts:'Sin productos en esta categoría', soldCount:'vendidos',
        shelfEmpty:'Sin productos',
        historyEmpty:'¡Sin pedidos aún!', historyEmptySub:'Tu historial está vacío 😊',
        order:'Pedido', readMore:'Leer más', noBlog:'Sin artículos',
        productsInCat:'productos en esta categoría', rights:'Todos los derechos reservados',
        welcome:'Bienvenido,', loggedOut:'Sesión cerrada',
        invalidEmail:'Ingresa un correo válido', addedToCart:'Añadido al carrito 🛍️',
        noWhatsapp:'¡Número de WhatsApp no configurado!',
        choosePayment:'Método de pago',
        payWhatsapp:'WhatsApp', payWhatsappSub:'Confirmar vía WhatsApp',
        payCard:'Tarjeta bancaria', payCardSub:'Visa / Mastercard / Amex',
        payInstapay:'InstaPay', payInstapaySub:'Transferencia instantánea',
        payVodafone:'Vodafone Cash', payVodafoneSub:'Monedero Vodafone',
        sendToNumber:'Transferir al:', sendScreenshot:'Enviar recibo por WhatsApp',
        orderConfirmed:'¡Pedido confirmado! ✅', cartEmptyErr:'¡Carrito vacío!',
        fillCardData:'Completar datos tarjeta', cardOrderSent:'Pedido recibido 🎉',
        tabProducts:'Productos', tabBlog:'Blog', tabHero:'Banner',
        tabCats:'Categorías', tabAbout:'Sobre nosotros', tabSocial:'Redes', tabSettings:'Ajustes',
        adminPanel:'Panel admin', saveClose:'Guardar', cancel:'Cancelar',
        settingsSaved:'Configuración guardada ⚙️', socialSaved:'Redes actualizadas 🌐',
        catAdded:'Categoría añadida ✓',
        catExists:'Categoría ya existe!',
        catNameEmpty:'Nombre requerido!', catDeleted:'Categoría eliminada',
        heroSaved:'Banner guardado ✓', productSaved:'Producto publicado ✓',
        productDeleted:'Producto eliminado', blogSaved:'Artículo publicado ✓',
        blogDeleted:'Artículo eliminado', aboutSaved:'Sobre nosotros guardado ✓',
        firebaseConnected:'Conectado a la base de datos 🔥',
        securePayment:'Pago seguro y cifrado 🔒', sslProtected:'Protegido por SSL 256-bit',
        cardholderName:'Nombre en la tarjeta', cardNumber:'Número de tarjeta',
        expiryDate:'Fecha de vencimiento', cvv:'CVV',
        cardBrands:'Visa / Mastercard / Amex',
    },
    it: {
        dir:'ltr', label:'IT', font:'Cairo',
        catNames:{'الكل':'Tutto','صحة':'Salute','تجميل':'Bellezza','إلكترونيات':'Elettronica','آثاث منزلي':'Arredamento','مطبخ':'Cucina','اكسسورات':'Accessori'}, catAll:'Tutto',
        login:'Accedi', logout:'Esci', member:'Membro MARASSiA',
        myHistory:'I miei ordini', ourStore:'Il nostro negozio', ourBlog:'Il nostro blog',
        aboutUs:'Chi siamo', followUs:'Seguici su', home:'Home',
        searchPlaceholder:'Cerca...', historyTitle:'Cronologia',
        logoutTitle:'Esci', loginTitle:'Accedi', cartTitle:'Carrello',
        trending:'Di tendenza', bestSellers:'Più venduti',
        allProducts:'Tutti i prodotti', backToBlog:'Torna al blog', ourStory:'La nostra storia',
        cart:'Carrello', total:'Totale:', sendOrder:'Ordina via WhatsApp',
        cartEmpty:'Il carrello è vuoto!', currency:'EGP',
        email:'Indirizzo e-mail', loginBtn:'Accedi / Registrati', purchaseHistory:'Cronologia',
        addToCart:'Aggiungi al carrello', buyFromAgent:'Acquista dal venditore',
        noProducts:'Nessun prodotto', noCatProducts:'Nessun prodotto in questa categoria', soldCount:'venduti',
        shelfEmpty:'Nessun prodotto',
        historyEmpty:'Nessun ordine!', historyEmptySub:'La cronologia è vuota 😊',
        order:'Ordine', readMore:'Leggi di più', noBlog:'Nessun articolo',
        productsInCat:'prodotti in questa categoria', rights:'Tutti i diritti riservati',
        welcome:'Benvenuto,', loggedOut:'Disconnesso con successo',
        invalidEmail:"Inserisci un'e-mail valida", addedToCart:'Aggiunto al carrello 🛍️',
        noWhatsapp:'Numero WhatsApp non impostato!',
        choosePayment:'Metodo di pagamento',
        payWhatsapp:'WhatsApp', payWhatsappSub:'Conferma via WhatsApp',
        payCard:'Carta bancaria', payCardSub:'Visa / Mastercard / Amex',
        payInstapay:'InstaPay', payInstapaySub:'Trasferimento istantaneo',
        payVodafone:'Vodafone Cash', payVodafoneSub:'Portafoglio Vodafone',
        sendToNumber:'Trasferisci a:', sendScreenshot:'Invia ricevuta su WhatsApp',
        orderConfirmed:'Ordine confermato! ✅', cartEmptyErr:'Carrello vuoto!',
        fillCardData:'Compila dati carta', cardOrderSent:'Ordine ricevuto 🎉',
        tabProducts:'Prodotti', tabBlog:'Blog', tabHero:'Banner',
        tabCats:'Categorie', tabAbout:'Chi siamo', tabSocial:'Social', tabSettings:'Impostazioni',
        adminPanel:'Pannello admin', saveClose:'Salva', cancel:'Annulla',
        settingsSaved:'Impostazioni aggiornate ⚙️', socialSaved:'Social aggiornati 🌐',
        catAdded:'Categoria aggiunta ✓',
        catExists:'Categoria già esistente!',
        catNameEmpty:'Nome richiesto!', catDeleted:'Categoria eliminata',
        heroSaved:'Banner salvato ✓', productSaved:'Prodotto pubblicato ✓',
        productDeleted:'Prodotto eliminato', blogSaved:'Articolo pubblicato ✓',
        blogDeleted:'Articolo eliminato', aboutSaved:'Chi siamo salvato ✓',
        firebaseConnected:'Connesso al database 🔥',
        securePayment:'Pagamento sicuro e crittografato 🔒', sslProtected:'Protetto da SSL 256-bit',
        cardholderName:'Nome sulla carta', cardNumber:'Numero carta',
        expiryDate:'Data di scadenza', cvv:'CVV',
        cardBrands:'Visa / Mastercard / Amex',
    },
    de: {
        dir:'ltr', label:'DE', font:'Cairo',
        catNames:{'الكل':'Alle','Kitchen Finds':'Küche','Home Finds':'Haus','آثاث':'Möbel','إلكترونيات':'Elektronik','اكسسوارات إلكترونيات':'Tech-Zubehör','صحة وتجميل':'Gesundheit','ملابس رجالي':'Herrenmode','ملابس حريمي':'Damenmode','ملابس أطفال بناتي':'Mädchen','ملابس أطفال ولادي':'Jungen','ساعات':'Uhren','مجوهرات وإكسسوارات':'Schmuck','حقائب':'Taschen','طبي ودواء':'Medizin'}, catAll:'Alle',
        login:'Anmelden', logout:'Abmelden', member:'MARASSiA Mitglied',
        myHistory:'Meine Bestellungen', ourStore:'Unser Shop', ourBlog:'Unser Blog',
        aboutUs:'Über uns', followUs:'Folgt uns auf', home:'Startseite',
        searchPlaceholder:'Suchen...', historyTitle:'Kaufhistorie',
        logoutTitle:'Abmelden', loginTitle:'Anmelden', cartTitle:'Warenkorb',
        trending:'Im Trend', bestSellers:'Bestseller',
        allProducts:'Alle Produkte', backToBlog:'Zurück zum Blog', ourStory:'Unsere Geschichte',
        cart:'Warenkorb', total:'Gesamt:', sendOrder:'Bestellen via WhatsApp',
        cartEmpty:'Ihr Warenkorb ist leer!', currency:'EGP',
        email:'E-Mail-Adresse', loginBtn:'Anmelden / Registrieren', purchaseHistory:'Kaufhistorie',
        addToCart:'In den Warenkorb', buyFromAgent:'Beim Händler kaufen',
        noProducts:'Keine Produkte', noCatProducts:'Keine Produkte in dieser Kategorie', soldCount:'verkauft',
        shelfEmpty:'Keine Produkte',
        historyEmpty:'Keine Bestellungen!', historyEmptySub:'Ihre Historie ist leer 😊',
        order:'Bestellung', readMore:'Mehr lesen', noBlog:'Keine Artikel',
        productsInCat:'Produkte in dieser Kategorie', rights:'Alle Rechte vorbehalten',
        welcome:'Willkommen,', loggedOut:'Erfolgreich abgemeldet',
        invalidEmail:'Bitte gültige E-Mail eingeben', addedToCart:'In den Warenkorb 🛍️',
        noWhatsapp:'WhatsApp-Nummer nicht gesetzt!',
        choosePayment:'Zahlungsmethode',
        payWhatsapp:'WhatsApp', payWhatsappSub:'Bestätigen via WhatsApp',
        payCard:'Bankkarte', payCardSub:'Visa / Mastercard / Amex',
        payInstapay:'InstaPay', payInstapaySub:'Sofortüberweisung',
        payVodafone:'Vodafone Cash', payVodafoneSub:'Vodafone Wallet',
        sendToNumber:'Betrag überweisen an:', sendScreenshot:'Quittung per WhatsApp',
        orderConfirmed:'Bestellung bestätigt! ✅', cartEmptyErr:'Warenkorb leer!',
        fillCardData:'Kartendaten ausfüllen', cardOrderSent:'Bestellung erhalten 🎉',
        tabProducts:'Produkte', tabBlog:'Blog', tabHero:'Banner',
        tabCats:'Kategorien', tabAbout:'Über uns', tabSocial:'Social', tabSettings:'Einstellungen',
        adminPanel:'Admin-Panel', saveClose:'Speichern', cancel:'Abbrechen',
        settingsSaved:'Einstellungen gespeichert ⚙️', socialSaved:'Social aktualisiert 🌐',
        catAdded:'Kategorie hinzugefügt ✓',
        catExists:'Kategorie existiert bereits!',
        catNameEmpty:'Name erforderlich!', catDeleted:'Kategorie gelöscht',
        heroSaved:'Banner gespeichert ✓', productSaved:'Produkt veröffentlicht ✓',
        productDeleted:'Produkt gelöscht', blogSaved:'Artikel veröffentlicht ✓',
        blogDeleted:'Artikel gelöscht', aboutSaved:'Über uns gespeichert ✓',
        firebaseConnected:'Mit Datenbank verbunden 🔥',
        securePayment:'Sichere Zahlung 🔒', sslProtected:'SSL 256-bit verschlüsselt',
        cardholderName:'Name auf der Karte', cardNumber:'Kartennummer',
        expiryDate:'Ablaufdatum', cvv:'CVV',
        cardBrands:'Visa / Mastercard / Amex',
    },
    zh: {
        dir:'ltr', label:'中文', font:'Cairo',
        catNames:{'الكل':'全部','صحة':'健康','تجميل':'美妆','إلكترونيات':'电子产品','آثاث منزلي':'家具','مطبخ':'厨房','اكسسورات':'配饰'}, catAll:'全部',
        login:'登录', logout:'退出', member:'MARASSiA 会员',
        myHistory:'我的订单', ourStore:'我们的商店', ourBlog:'我们的博客',
        aboutUs:'关于我们', followUs:'关注我们', home:'首页',
        searchPlaceholder:'搜索...', historyTitle:'购买记录',
        logoutTitle:'退出登录', loginTitle:'登录', cartTitle:'购物车',
        trending:'热门商品', bestSellers:'畅销商品',
        allProducts:'全部商品', backToBlog:'返回博客', ourStory:'我们的故事',
        cart:'购物车', total:'合计：', sendOrder:'通过WhatsApp下单',
        cartEmpty:'购物车是空的！', currency:'EGP',
        email:'电子邮箱', loginBtn:'登录 / 注册', purchaseHistory:'购买记录',
        addToCart:'加入购物车', buyFromAgent:'从经销商购买',
        noProducts:'暂无商品', noCatProducts:'此分类暂无商品', soldCount:'已售',
        shelfEmpty:'暂无商品',
        historyEmpty:'暂无订单！', historyEmptySub:'您的历史记录是空的 😊',
        order:'订单', readMore:'阅读更多', noBlog:'暂无文章',
        productsInCat:'件商品在此分类', rights:'版权所有',
        welcome:'欢迎，', loggedOut:'已成功退出登录',
        invalidEmail:'请输入有效的电子邮箱', addedToCart:'已加入购物车 🛍️',
        noWhatsapp:'WhatsApp号码未设置！',
        choosePayment:'选择支付方式',
        payWhatsapp:'WhatsApp', payWhatsappSub:'通过WhatsApp确认',
        payCard:'银行卡', payCardSub:'Visa / Mastercard / Amex',
        payInstapay:'InstaPay', payInstapaySub:'即时转账',
        payVodafone:'Vodafone Cash', payVodafoneSub:'Vodafone钱包',
        sendToNumber:'转账至:', sendScreenshot:'通过WhatsApp发送收据',
        orderConfirmed:'订单已确认 ✅', cartEmptyErr:'购物车为空！',
        fillCardData:'填写银行卡信息', cardOrderSent:'订单已收到 🎉',
        tabProducts:'产品', tabBlog:'博客', tabHero:'横幅',
        tabCats:'分类', tabAbout:'关于我们', tabSocial:'社交', tabSettings:'设置',
        adminPanel:'管理面板', saveClose:'保存', cancel:'取消',
        settingsSaved:'设置已更新 ⚙️', socialSaved:'社交链接已更新 🌐',
        catAdded:'类别已添加 ✓',
        catExists:'类别已存在!',
        catNameEmpty:'需要名称!', catDeleted:'类别已删除',
        heroSaved:'横幅已保存 ✓', productSaved:'产品已发布 ✓',
        productDeleted:'产品已删除', blogSaved:'文章已发布 ✓',
        blogDeleted:'文章已删除', aboutSaved:'关于我们已保存 ✓',
        firebaseConnected:'已连接数据库 🔥',
        securePayment:'安全加密支付 🔒', sslProtected:'SSL 256位加密',
        cardholderName:'持卡人姓名', cardNumber:'卡号',
        expiryDate:'有效期', cvv:'CVV',
        cardBrands:'Visa / Mastercard / Amex',
    }
}

let currentLang = localStorage.getItem('marassia_lang') || 'ar';

/* ── Core Apply Function ── */
function applyLang(langCode) {
    if (!LANGS[langCode]) return;
    currentLang = langCode;
    localStorage.setItem('marassia_lang', langCode);
    const t   = LANGS[langCode];
    const dir = t.dir;

    // Direction & lang attr
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', langCode);

    // All data-i18n elements (skip hero which has data-no-i18n)
    document.querySelectorAll('[data-i18n]:not([data-no-i18n])').forEach(el => {
        const key = el.dataset.i18n;
        if (t[key] !== undefined) el.textContent = t[key];
    });

    // Search placeholder
    const si = document.getElementById('smart-search');
    if (si) si.placeholder = t.searchPlaceholder;

    // Button titles
    const ht = document.getElementById('history-trigger');
    if (ht) ht.title = t.historyTitle;
    const lo = document.getElementById('logout-btn');
    if (lo) lo.title = t.logoutTitle;
    const li = document.getElementById('login-trigger');
    if (li) li.title = t.loginTitle;

    // Lang switcher UI
    const lblEl = document.getElementById('lang-current-label');
    if (lblEl) lblEl.textContent = t.label;

    // Mark active option
    document.querySelectorAll('.lang-option').forEach(el => {
        el.classList.toggle('active', el.dataset.lang === langCode);
    });

    // Re-render dynamic sections that contain translated strings
    renderCategoryBar();
    renderProductsGrid();
    renderShelves();
    renderBlogs();
    if (document.getElementById('view-category').classList.contains('active')) {
        renderCategoryPage(currentCat);
    }

    // Fix arrow direction for RTL/LTR
    document.querySelectorAll('.cat-page-back i, .article-back-btn i').forEach(ic => {
        ic.className = dir === 'rtl'
            ? 'fas fa-arrow-right'
            : 'fas fa-arrow-left';
    });
}

function toggleLangDropdown() {
    document.getElementById('lang-dropdown').classList.toggle('open');
}

function setLang(langCode) {
    applyLang(langCode);
    document.getElementById('lang-dropdown').classList.remove('open');
}

// Close lang dropdown on outside click
document.addEventListener('click', (e) => {
    const wrap = document.getElementById('lang-picker-wrap');
    if (wrap && !wrap.contains(e.target)) {
        document.getElementById('lang-dropdown')?.classList.remove('open');
    }
});

/* expose t() helper for render functions */
function t(key) {
    return (LANGS[currentLang] || LANGS['ar'])[key] || LANGS['ar'][key] || key;
}

/* translate a category name */
function tCat(arName) {
    const names = (LANGS[currentLang] || LANGS['ar']).catNames || {};
    return names[arName] || arName;
}

/* translate product name/desc if translations exist, else original */
function tProd(p, field) {
    if (!p) return '';
    var tr = p.translations;
    // 1. Exact match for current language
    if (tr && tr[currentLang] && tr[currentLang][field]) return tr[currentLang][field];
    // 2. Arabic as universal fallback (always present if translated)
    if (tr && tr['ar'] && tr['ar'][field]) return tr['ar'][field];
    // 3. Try any available language
    if (tr) {
        var langs = Object.keys(tr);
        for (var i = 0; i < langs.length; i++) {
            if (tr[langs[i]] && tr[langs[i]][field]) return tr[langs[i]][field];
        }
    }
    // 4. Original field value
    return p[field] || '';
}

/* ─────────────────────────────────────────
   3. DATABASE
───────────────────────────────────────── */
const DEFAULT_ABOUT = `أهلاً بك في عالم التسوق الذكي MARASSiA!

نحن لا نقدم مجرد منتجات، بل نصنع تجربة متكاملة تمزج بين الفخامة والتقنية الحديثة. شعارنا "MAKE A REAL AND STRONG SENSE" ليس مجرد كلمات، بل هو وعد نلتزم به في كل قسم.

نستلهم قيمنا من أصالة مجتمعاتنا ونفتخر بجذورنا التي تمتد لخدمة كل مكان، بما في ذلك مبادراتنا المستمدة من قرية معصرة صاوي.

نسعى دائماً لنكون الخيار الأول لك في عالم الإلكترونيات والتجميل والمزيد.`;


/* ═══════════════════════════════════════════════════════
   FIREBASE — Cloud Database
   ▸ Fill YOUR_CONFIG below from Firebase Console
   ▸ Until filled: runs on localStorage (offline mode)
═══════════════════════════════════════════════════════ */

const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyDNqp5TzfoGtj-zmx1pMetHO-uJOwkFbxA",
    authDomain:        "marassia-20.firebaseapp.com",
    databaseURL:       "https://marassia-20-default-rtdb.firebaseio.com",
    projectId:         "marassia-20",
    storageBucket:     "marassia-20.firebasestorage.app",
    messagingSenderId: "888062722230",
    appId:             "1:888062722230:web:8ece671e61886e0d296617",
    measurementId:     "G-2EMZZGNVG9"
};;

/* ── Check if Firebase is configured ── */
const FB_READY = FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY";
let   fbDB     = null;
var   _lastSaveTime = 0;
const FB_PATH  = "marassia/store";

/* Firebase syncs in background after UI is visible */
function _startFirebaseSync(){
    if(!FB_READY) return;
    if(typeof firebase==='undefined'){ setTimeout(_startFirebaseSync,200); return; }
    if(fbDB) return;
    try {
        var fbApp;
        try { fbApp=firebase.app(); } catch(e2){ fbApp=firebase.initializeApp(FIREBASE_CONFIG); }
        fbDB = firebase.database(fbApp);
        _initAuth();

        var _fbFirstLoad = true;

        fbDB.ref(FB_PATH).on('value', function(snap){
            var data = snap.val();
            if (!data) {
                // Firebase empty → push local data to cloud NOW
                console.log('[Firebase] DB empty — pushing local data');
                var toSync = JSON.parse(JSON.stringify(db));
                if (toSync.products) toSync.products = toSync.products.map(function(p){
                    var q=Object.assign({},p);
                    if(q.media&&q.media.startsWith('data:')) q.media='';
                    return q;
                });
                fbDB.ref(FB_PATH).set(toSync).then(function(){
                    console.log('[Firebase] ✅ Pushed!'); showToast('✅ تمت مزامنة البيانات');
                }).catch(function(e){ console.error('[Firebase]',e.message); });
                return;
            }
            if (_fbFirstLoad) {
                _fbFirstLoad = false;
                console.log('[Firebase] First load — loading ALL data from Firebase');
                // Firebase is ALWAYS source of truth on first load
                // This ensures products show on every device (no localStorage dependency)
                ['categories','settings','social','payment',
                 'products','blogs','sidebarLinks','reviews','orders','catTranslations']
                    .forEach(function(k){
                        if(data[k]!==undefined) db[k]=data[k];
                    });
            } else {
                if (Date.now() - _lastSaveTime < 4000) return;
                ['categories','settings','social','payment','products','blogs','sidebarLinks','reviews','orders']
                    .forEach(function(k){ if(data[k]!==undefined) db[k]=data[k]; });
            }
            if(Array.isArray(db.products))
                db.products=db.products.filter(function(x){ return x&&typeof x.id==='number'; });
            if(!db.settings) db.settings={};
            if(!db.settings.hero) db.settings.hero={type:'text',title:'',subtitle:'',media:''};
            if(!db.payment) db.payment={instapay:'',vodafone:''};
            db.products.forEach(function(p){ if(p.salesCount===undefined) p.salesCount=0; });
            try{ localStorage.setItem(DB_KEY,JSON.stringify(db)); }catch(e){}
            renderProductsGrid(); renderShelves(); renderBlogs(); setTimeout(_animateProductCards, 150);
            renderCategoryBar(); renderLogo(); renderHero(); renderAboutUs(); renderSidebarSocial();
            renderSidebarLinks(); renderSidebarChannel(); renderChannelView();
            if(typeof applyDynamicColors==='function') applyDynamicColors();
            renderBestSellers();
            if(typeof renderCrossroadsHero==='function') renderCrossroadsHero();
            if(typeof renderCategoryJourneys==='function') renderCategoryJourneys();
            // If on admin page, refresh admin UI
            if(typeof _runAdminUI==='function') _runAdminUI();
        }, function(e){ console.warn('[FB]',e.code,e.message); });

        fbDB.ref('.info/connected').on('value', function(snap){
            var el=document.getElementById('fb-status'); if(!el) return;
            var on=snap.val()===true;
            el.style.background=on?'#22c55e':'#f59e0b';
            el.style.boxShadow=on?'0 0 6px #22c55e':'none';
            el.title=on?'Firebase متصل ✓':'وضع محلي';
        });
    } catch(e){ console.warn('[FB] init:',e.message); }
}
const DB_KEY = 'marassia_v2';

let db = {
    categories: ["Kitchen Finds", "Home Finds", "آثاث", "إلكترونيات", "اكسسوارات إلكترونيات", "صحة وتجميل", "ملابس رجالي", "ملابس حريمي", "ملابس أطفال بناتي", "ملابس أطفال ولادي", "ساعات", "مجوهرات وإكسسوارات", "حقائب", "طبي ودواء"],
    settings: {
        logo:     "MARASSiA",
        whatsapp: "",
        aboutUs:  DEFAULT_ABOUT,
        hero: { type: 'text', title: 'MARASSiA', subtitle: 'تجربة تسوق فاخرة تفوق الخيال', media: '' },
        intro: { enabled: false, duration: 3, text: '', subtext: '', color: '#001a66' },
        apiKey: ''
    },
    social: { fb: "", yt: "", ig: "", tt: "", pin: "" },
    sidebarLinks: [],
    reviews: {},
    payment: { instapay: "", vodafone: "" },
    products: [
    ],
    blogs: [
        {
            id: 1, title: "شريحة المستقبل",
            desc: "أداء خرافي لم يسبق له مثيل في عالم الأجهزة الذكية. هذه التقنية ستغير كل شيء في حياتك اليومية.",
            style: "style-light",
            media: "https://images.unsplash.com/photo-1606248897732-2c5ffe759c04?w=800"
        },
        {
            id: 2, title: "تصميم التيتانيوم",
            desc: "أقوى وأخف وزناً من أي جيل مضى — الجمال المعدني في أبهى صوره. فلسفة التصميم التي تجمع بين الأداء والجماليات.",
            style: "style-dark",
            media: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800"
        }
    ]
};

// Migrate old data: add missing fields if loading older localStorage
if (!db.payment) db.payment = { instapay: '', vodafone: '' };
if (!db.settings.hero) db.settings.hero = { type:'text', title:'MARASSiA', subtitle:'تجربة تسوق فاخرة تفوق الخيال', media:'' };
// Load persisted data securely (overwrites defaults)
loadDb();

db.products.forEach(p => { if (p.salesCount === undefined) p.salesCount = 0; if (!p.addedAt) p.addedAt = p.id; });

let shoppingCart = [];
let currentCat   = "الكل";
let currentUser  = localStorage.getItem('marassia_user') || null;

function saveDb() {
    // 1. Always save to localStorage first (instant, offline-safe)
    try {
        // Save a version without base64 images for localStorage (use URLs when possible)
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch(e) {
        // localStorage full → save without image data, keep Firebase as source of truth
        try {
            var slim = JSON.parse(JSON.stringify(db));
            slim.products = slim.products.map(function(p) {
                return Object.assign({}, p, { media: p.media && p.media.startsWith('data:') ? '' : p.media });
            });
            localStorage.setItem(DB_KEY, JSON.stringify(slim));
            showToast('⚠️ الصور محفوظة على Firebase فقط (ذاكرة محلية ممتلئة)', 'info');
        } catch(e2) { console.warn('[MARASSiA] storage full'); }
    }
    // 2. Push to Firebase if connected (real-time sync for all devices)
    if (fbDB) {
        _lastSaveTime = Date.now();
        // Strip base64 images before Firebase write (Firebase 10MB limit)
        // base64 images stay in localStorage only
        var dbForFirebase = JSON.parse(JSON.stringify(db));
        dbForFirebase.products = dbForFirebase.products.map(function(p) {
            var clean = Object.assign({}, p);
            if (clean.media && clean.media.startsWith('data:')) {
                clean.media = ''; // remove base64, keep URL-only
            }
            if (clean.images) {
                clean.images = clean.images.filter(function(u){ return u && !u.startsWith('data:'); });
            }
            return clean;
        });
        if (dbForFirebase.settings && dbForFirebase.settings.hero && 
            dbForFirebase.settings.hero.media && dbForFirebase.settings.hero.media.startsWith('data:')) {
            dbForFirebase.settings.hero.media = '';
        }
        fbDB.ref(FB_PATH).set(dbForFirebase).catch(function(e) {
            console.warn('[MARASSiA] Firebase write:', e.message);
            if (e.message && e.message.includes('PERMISSION_DENIED')) {
                showToast('⚠️ Firebase: تأكد من أن Rules مضبوطة على true', 'error');
            }
            setTimeout(function() {
                fbDB.ref(FB_PATH).set(dbForFirebase).catch(function(){});
            }, 3000);
        });
    }
}
function loadDb() {
    var _sv = localStorage.getItem('marassia_schema_v');
    if (_sv !== '3') { localStorage.removeItem(DB_KEY); localStorage.setItem('marassia_schema_v','3'); }
    try {
        const raw = localStorage.getItem(DB_KEY);
        if (!raw) return;
        const p = JSON.parse(raw);
        if (typeof p !== 'object' || Array.isArray(p) || !p) return;
        ['categories','settings','social','payment','products','blogs','sidebarLinks','reviews'].forEach(k => { if (p[k] !== undefined) db[k] = p[k]; });
        if (Array.isArray(db.products))
            db.products = db.products.filter(x => x && typeof x.id==='number' && typeof x.name==='string');
    } catch(e) { localStorage.removeItem(DB_KEY); }
}
function _saveDb_legacy() {
    try {
        localStorage.setItem('marassia_v2', JSON.stringify(db));
    } catch(e) {
        showToast("تحذير: مساحة التخزين امتلأت!", "error");
    }
}

/* ─────────────────────────────────────────
   4. INIT
───────────────────────────────────────── */
/* ════ DYNAMIC DESIGN ENGINE — reads from db.settings.colors ════ */
function applyDynamicColors() {
    var colors = db.settings && db.settings.colors;
    if (!colors || !Object.keys(colors).length) return;
    var root = document.documentElement;
    var map = {
        primaryBlue: '--primary-blue',
        darkBlue:    '--dark-blue',
        gold:        '--gold',
        bgLight:     '--bg-light',
        white:       '--white',
        textGray:    '--text-gray',
    };
    Object.keys(map).forEach(function(k) {
        if (colors[k]) root.style.setProperty(map[k], colors[k]);
    });
    // Apply custom CSS if set
    var customCSS = db.settings.customCSS;
    if (customCSS) {
        var el = document.getElementById('dynamic-custom-css');
        if (!el) { el = document.createElement('style'); el.id = 'dynamic-custom-css'; document.head.appendChild(el); }
        el.textContent = customCSS;
    }
}

function _restoreCatTranslations() {
    var tr = db.catTranslations;
    if (!tr) return;
    Object.keys(tr).forEach(function(lang){
        if (!LANGS[lang]) return;
        if (!LANGS[lang].catNames) LANGS[lang].catNames = {};
        Object.assign(LANGS[lang].catNames, tr[lang]);
    });
}
function _safeRun(fn, name) {
    try { fn(); }
    catch(e) { console.warn('[MARASSiA] ' + (name||'render') + ' error:', e.message); }
}

function _forceHideLoader() {
    var l = document.getElementById('loader');
    if (!l) return;
    l.classList.add('hidden');
    l.style.display = 'none';
    l.style.pointerEvents = 'none';
}

function initializeApp() {
    // URL routing first — only intercept actual /product/ paths
    if (typeof _checkProductURL === 'function' && location.pathname.startsWith('/product/')) {
        _checkProductURL(); _forceHideLoader(); return;
    }

    _safeRun(applyDynamicColors, 'colors');
    _safeRun(renderLogo,         'logo');
    _safeRun(renderHero,         'hero');
    _safeRun(renderCategoryBar,  'catBar');
    _safeRun(renderProductsGrid, 'grid');
    _safeRun(renderShelves,      'shelves');
    _safeRun(renderBlogs,        'blogs');
    _safeRun(renderAboutUs,      'about');
    _safeRun(renderSidebarSocial,'social');
    _safeRun(renderSidebarLinks, 'links');
    _safeRun(renderSidebarChannel,'channel');
    _safeRun(checkUserLogin,     'login');
    _safeRun(initAppleAnimations,'anim');
    _safeRun(function(){ applyLang(currentLang); }, 'lang');

    // v2 features
    if (typeof renderCrossroadsHero   === 'function') _safeRun(renderCrossroadsHero,   'crossroads');
    if (typeof renderCategoryJourneys === 'function') _safeRun(renderCategoryJourneys, 'journeys');
    if (typeof _updateCompareBar      === 'function') _safeRun(_updateCompareBar,       'compare');

    // Restore URL-based view
    _safeRun(_restoreView, 'restoreView');

    // Restore correct view based on URL
    _safeRun(_restoreView, 'restoreView');
    // ALWAYS hide loader — no matter what
    _forceHideLoader();
}

/* ─────────────────────────────────────────
   5. RENDER FUNCTIONS (FIX #7 — targeted renders)
───────────────────────────────────────── */

function renderLogo() {
    if(!document.getElementById('site-logo-text')) return;
    const logo = db.settings.logo || 'MARASSiA';
    const isImg = /^https?:\/\//i.test(logo) || logo.startsWith('data:image')
               || /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(logo);
    document.getElementById('main-logo-container').innerHTML = isImg
        ? `<img src="${sanitize(logo)}" class="site-logo-img" alt="MARASSiA"
               onerror="this.outerHTML='<span class=site-logo-text>MARASSiA</span>'">`
        : `<span class="site-logo-text">${sanitize(logo)}</span>`;
}

/* ── Hero Banner ── */
function renderHero() { if(!document.getElementById('main-hero')) return;
    const h    = db.settings.hero || {};
    const hero = document.getElementById('main-hero');
    const titleEl = document.getElementById('hero-title-el');
    const subEl   = document.getElementById('hero-sub-el');

    // Remove old media + CTA rows
    hero.querySelectorAll('.hero-media-bg,.hero-overlay,.hero-cta-row,.hero-scroll-line').forEach(e => e.remove());

    const hasMedia = (h.type === 'image' || h.type === 'video') && h.media;

    if (hasMedia) {
        // Media mode: hide text completely, show only visual
        titleEl.style.display = 'none';
        subEl.style.display   = 'none';
        // Overlay
        const ov = document.createElement('div');
        ov.className = 'hero-overlay';
        hero.insertBefore(ov, hero.firstChild);
        if (h.type === 'video') {
            const vid = document.createElement('video');
            vid.src = sanitize(h.media);
            vid.autoplay = true; vid.loop = true;
            vid.muted = true; vid.playsInline = true;
            vid.className = 'hero-media-bg vid-bg';
            hero.insertBefore(vid, hero.firstChild);
        } else {
            const img = document.createElement('img');
            img.src = sanitize(h.media); img.alt = '';
            img.className = 'hero-media-bg img-bg';
            hero.insertBefore(img, hero.firstChild);
        }
    } else {
        // Text mode: restore visibility + content
        titleEl.style.display = '';
        subEl.style.display   = '';
        const title = tObj(h,'title') || h.title || 'MARASSiA';
        if (!title || title === 'MARASSiA') {
            titleEl.innerHTML = '<span class="hero-brand-gold">MARASSiA</span>';
        } else {
            titleEl.textContent = title;
        }
        subEl.textContent = tObj(h,'subtitle') || h.subtitle || 'تجربة تسوق فاخرة تفوق الخيال';
    }
    // Ensure text is visible on initial load even before renderHero is called
    if (!titleEl.textContent && !titleEl.innerHTML) {
        titleEl.innerHTML = '<span class="hero-brand-gold">MARASSiA</span>';
    }
    if (!subEl.textContent) {
        subEl.textContent = 'تجربة تسوق فاخرة تفوق الخيال';
    }
}

/* ── Shelf Cards (Trending + Best Sellers) ── */
function renderShelves() {
    // Trending = 4 newest products (sorted by addedAt desc)
    if(!document.getElementById('products-grid') && !document.querySelector('.shelf-scroll')) return;
    const trending = [...db.products]
        .sort((a, b) => (b.addedAt || b.id) - (a.addedAt || a.id))
        .slice(0, 8);

    // Best Sellers = sorted by salesCount desc, only those with >0
    const bestSellers = [...db.products]
        .filter(p => p.salesCount > 0)
        .sort((a, b) => b.salesCount - a.salesCount)
        .slice(0, 8);

    renderShelf('trending-shelf',    trending,    'fire', '🔥');
    renderShelf('bestsellers-shelf', bestSellers, 'star', '⭐');
}

function renderShelf(containerId, items, badgeClass, emoji) {
    const el = document.getElementById(containerId);
    if (!items.length) {
        el.innerHTML = `<div class="shelf-empty"><i class="fas fa-box-open"></i><br>${t('shelfEmpty')}</div>`;
        return;
    }
    el.innerHTML = items.map(p => {
        const src = (p.media && p.media.trim()) ? p.media : 'https://images.unsplash.com/photo-1553949333-f3e26e73ce76?w=300';
        const med = p.type === 'vid'
            ? `<video src="${sanitize(src)}" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>`
            : `<img src="${sanitize(src)}" alt="${sanitize(p.name)}" loading="lazy" decoding="async" width="400" height="300"
                    onerror="this.src='https://images.unsplash.com/photo-1553949333-f3e26e73ce76?w=300'">`;
        const sales = p.salesCount > 0 ? `<br><span style="font-size:.7rem;color:#aaa;">${p.salesCount} ${t('soldCount')}</span>` : '';
        return `
            <div class="shelf-card" onclick="navigateToProduct(${p.id})">
                <span class="shelf-badge ${badgeClass}">${emoji}</span>
                <div class="shelf-card-media">${med}</div>
                <div class="shelf-card-body">
                    <div class="shelf-card-name">${sanitize(tProd(p,'name'))}</div>
                    <div class="shelf-card-price">${Number(p.price).toLocaleString()} ${t('currency')}${sales}</div>
                </div>
            </div>`;
    }).join('');
}

function renderCategoryBar() {
    if(!document.getElementById('cat-bar')) return;
    const cats = ['الكل', ...db.categories];
    const catAll = t('catAll') || 'الكل';
    document.getElementById('category-bar').innerHTML = cats.map(c =>
        `<div class="cat-tab${currentCat === c ? ' active' : ''}"
              data-cat="${sanitize(c)}"
              onclick="filterByCategory(this.dataset.cat)">${sanitize(tCat(c))}</div>`
    ).join('');
}

function renderProductsGrid() {
    // Home page always shows ALL products (filtering goes to category page)
    const grid  = document.getElementById('products-grid'); if(!grid) return;
    const items = db.products;

    if (!items.length) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-gray);">
                <i class="fas fa-box-open" style="font-size:3.5rem;margin-bottom:16px;display:block;color:#ccc;"></i>
                <h3 id='no-prod-msg'>لا توجد منتجات بعد</h3>
            </div>`;
        return;
    }

    grid.innerHTML = items.map(p => {
        const src     = p.media || 'https://images.unsplash.com/photo-1553949333-f3e26e73ce76?w=400';
        const mediaEl = p.type === 'vid'
            ? `<video src="${sanitize(src)}" autoplay loop muted playsinline></video>`
            : `<img src="${sanitize(src)}" alt="${sanitize(p.name)}" loading="lazy" decoding="async"
                    onerror="this.src='https://images.unsplash.com/photo-1553949333-f3e26e73ce76?w=400'">`;
        const btn = p.aff
            ? `<a href="${sanitize(safeUrl(p.aff))}" target="_blank" rel="noopener noreferrer"
                  class="btn-action btn-affiliate" onclick="event.stopPropagation()">
                   <i class="fas fa-external-link-alt"></i> ${t('buyFromAgent')}</a>`
            : `<button class="btn-action btn-cart"
                       onclick="event.stopPropagation();addToCart(${p.id})">
                   <i class="fas fa-cart-plus"></i> ${t('addToCart')}</button>`;
        const isBestSeller = p.salesCount && p.salesCount >= 3;
        return `
            <div class="art-card card-fadein" onclick="navigateToProduct(${p.id})">
                <div class="art-category-badge">${sanitize(tCat(p.category))}</div>
                ${isBestSeller ? '<div class="bs-star-badge">⭐ Best</div>' : ''}
                <button onclick="openProductQR(${p.id},event)" title="QR Code" style="position:absolute;top:8px;left:8px;z-index:3;background:rgba(255,255,255,.9);border:none;border-radius:8px;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.7rem;color:var(--dark-blue);box-shadow:0 2px 8px rgba(0,0,0,.1);" aria-label="QR"><i class="fas fa-qrcode"></i></button>
                <div class="art-media">${mediaEl}</div>
                <div class="art-content">
                    <h3 class="art-title">${sanitize(tProd(p,'name'))}</h3>
                    <div class="art-price">${Number(p.price).toLocaleString()} ${t('currency')}</div>
                    ${btn}
                </div>
            </div>`;
    }).join('');
    initAppleAnimations();
}

function renderBlogs() {
    const grid = document.getElementById('blog-grid-container');
    if (!db.blogs.length) {
        grid.innerHTML = `
            <div style="text-align:center;padding:60px 20px;color:var(--text-gray);">
                <i class="fas fa-newspaper" style="font-size:3.5rem;margin-bottom:16px;display:block;color:#ccc;"></i>
                <h3>${t('noBlog')}</h3>
            </div>`;
        return;
    }
    grid.innerHTML = db.blogs.map(b => `
        <div class="bento-card ${sanitize(b.style)} apple-hide" onclick="openArticle(${b.id})">
            <h2>${sanitize(tObj(b,'title'))}</h2>
            <p>${sanitize((tObj(b,'desc')||b.desc||'').slice(0,120))}${(tObj(b,'desc')||b.desc||'').length>120?'...':''}</p>
            ${b.media ? `<img src="${sanitize(b.media)}" class="bento-img" loading="lazy" alt="${sanitize(b.title)}">` : ''}
            <span class="bento-read-more"><i class="fas fa-book-open"></i> ${t('readMore')}</span>
        </div>`
    ).join('');
    initAppleAnimations();
}

function renderAboutUs() { if(typeof _adminPage !== 'undefined' && _adminPage) return;
    document.getElementById('about-us-content').textContent = tObj(db.settings,'aboutUs') || db.settings.aboutUs || '';
}

/* FIX #6 — safeUrl handles empty/# gracefully, only render if URL is real */
function renderSidebarSocial() { if(!document.getElementById('sidebar-social-row')) return;
    const s = db.social;
    const platforms = [
        { key:'fb',  cls:'social-fb',  icon:'fab fa-facebook-f',    label:'Facebook'   },
        { key:'yt',  cls:'social-yt',  icon:'fab fa-youtube',       label:'YouTube'    },
        { key:'ig',  cls:'social-ig',  icon:'fab fa-instagram',     label:'Instagram'  },
        { key:'tt',  cls:'social-tt',  icon:'fab fa-tiktok',        label:'TikTok'     },
        { key:'pin', cls:'social-pin', icon:'fab fa-pinterest-p',   label:'Pinterest'  }
    ];
    const html = platforms
        .filter(p => s[p.key] && /^https?:\/\//i.test(s[p.key].trim()))
        .map(p =>
            `<a href="${sanitize(s[p.key])}" target="_blank" rel="noopener noreferrer"
                class="social-btn ${p.cls}" title="${p.label}" aria-label="${p.label}">
                 <i class="${p.icon}"></i>
             </a>`
        ).join('');
    document.getElementById('sidebar-social-row').innerHTML =
        html || `<p style="font-size:.8rem;color:#aaa;text-align:center;width:100%;">لم تُضف روابط بعد</p>`;
}

/* ─────────────────────────────────────────
   6. NAVIGATION
───────────────────────────────────────── */
var _URL_MAP = {
    crossroads:'/','home':'/store','blog':'/blog','channel':'/channel',
    'ai':'/ai','about':'/about','privacy':'/privacy','terms':'/terms',
    'shipping':'/shipping','returns':'/returns','medical':'/medical'
};

function navigate(viewId, opts) {
    opts = opts||{};
    document.querySelectorAll('.view-section').forEach(function(el){el.classList.remove('active');});
    var t = document.getElementById('view-'+viewId);
    if (t) t.classList.add('active');

    var path = _URL_MAP[viewId];

    if (viewId === 'category') {
        var cat = opts.cat || window._lastCat || '';
        if (cat) { window._lastCat=cat; path='/store/category/'+encodeURIComponent(cat); try{localStorage.setItem('marassia_cat',cat);}catch(e){} }
        else path='/store';
    }
    if (viewId === 'product') {
        try{localStorage.setItem('marassia_view','product');}catch(e){}
        window.scrollTo(0,0); return;
    }

    if (!path) path = '/'+viewId;

    if (!opts.replace && history.pushState) history.pushState({view:viewId,cat:opts.cat||null},'',path);
    else if (history.replaceState) history.replaceState({view:viewId,cat:opts.cat||null},'',path);

    try{localStorage.setItem('marassia_view',viewId);}catch(e){}

    if (typeof applyFilterLang==='function') setTimeout(applyFilterLang,50);
    if (viewId==='channel' && document.getElementById('view-channel')) renderChannelView();
    if (viewId==='category') setTimeout(applyFilterLang,50);
    if (viewId==='ai' && typeof _aiGreet==='function' && !_aiHistory.length) _aiGreet();
    if (viewId==='crossroads') {
        document.body.classList.add('view-crossroads-active');
        setTimeout(function(){if(typeof renderCrossroadsHero==='function')renderCrossroadsHero();},40);
    } else {
        document.body.classList.remove('view-crossroads-active');
    }
    if (viewId==='medical')    setTimeout(function(){if(typeof renderMedicalHero==='function')renderMedicalHero();},40);
    if (viewId==='home')       setTimeout(function(){if(typeof renderCategoryJourneys==='function')renderCategoryJourneys();},80);
    if (['privacy','terms','shipping','returns'].includes(viewId)) setTimeout(function(){if(typeof translateLegalPage==='function')translateLegalPage(viewId);},200);
    window.scrollTo(0,0);
}
function _restoreView() {
    var path = location.pathname;

    if (path.startsWith('/product/')) {
        var slug = decodeURIComponent(path.replace('/product/','').split('?')[0]);
        if (typeof db!=='undefined' && db.products && db.products.length) {
            var p = typeof findProductBySlug==='function' ? findProductBySlug(slug) : db.products.find(function(x){return String(x.id)===slug;});
            if (p) { renderProductPage(p); return; }
        }
        window._pendingProductSlug = slug;
        navigate('crossroads',{replace:true}); return;
    }

    if (path.startsWith('/store/category/')) {
        var cat = decodeURIComponent(path.replace('/store/category/','').split('?')[0]);
        document.querySelectorAll('.view-section').forEach(function(el){el.classList.remove('active');});
        var cv = document.getElementById('view-category');
        if (cv) cv.classList.add('active');
        window._lastCat = cat;
        if (typeof renderCategoryPage==='function') renderCategoryPage(cat);
        if (history.replaceState) history.replaceState({view:'category',cat:cat},'',path);
        try{localStorage.setItem('marassia_view','category');localStorage.setItem('marassia_cat',cat);}catch(e){}
        return;
    }

    var PATH_VIEW = {'/':'crossroads','/store':'home','/blog':'blog','/channel':'channel',
        '/ai':'ai','/about':'about','/privacy':'privacy','/terms':'terms',
        '/shipping':'shipping','/returns':'returns','/medical':'medical'};

    var viewId = PATH_VIEW[path];
    // Force crossroads on root path regardless of localStorage
    if (path === '/') viewId = 'crossroads';
    if (!viewId) {
        var hash = location.hash ? location.hash.replace('#','') : '';
        var saved=''; try{saved=localStorage.getItem('marassia_view')||'';}catch(e){}
        viewId = hash || saved || 'crossroads';
    }
    var valid=['home','crossroads','blog','channel','ai','about','privacy','terms','shipping','returns','category','product'];
    if (!valid.includes(viewId)) viewId='crossroads';
    navigate(viewId,{replace:true});
}
/* ── Category Bar Click ── */
function filterByCategory(catName) {
    // "الكل" → back to home page
    if (catName === 'الكل') {
        currentCat = 'الكل';
        renderCategoryBar();
        navigate('home');
        return;
    }

    // Any other category → dedicated category page
    currentCat = catName;
    renderCategoryBar();
    renderCategoryPage(catName);
    navigate('category');
}

/* ── Category Page Renderer ── */
function renderCategoryPage(catName) {
    window._lastCat = catName;
    if(history.pushState) history.pushState({view:"category",cat:catName},"","/store/category/"+encodeURIComponent(catName));
    const items = db.products.filter(p => p.category === catName);

    // Header
    document.getElementById('cat-page-title').textContent = tCat(catName);
    document.getElementById('cat-page-count').textContent =
        items.length ? `${items.length} ${t('productsInCat')}` : t('noCatProducts');

    const grid = document.getElementById('cat-page-grid');

    if (!items.length) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:70px 20px;color:var(--text-gray);">
                <i class="fas fa-box-open" style="font-size:4rem;display:block;margin-bottom:18px;color:#ddd;"></i>
                <h3 style="margin-bottom:8px;">${t("noCatProducts")}</h3>
                <p style="font-size:.92rem;"></p>
            </div>`;
        return;
    }

    grid.innerHTML = items.map(p => {
        const src     = p.media || 'https://images.unsplash.com/photo-1553949333-f3e26e73ce76?w=400';
        const mediaEl = p.type === 'vid'
            ? `<video src="${sanitize(src)}" autoplay loop muted playsinline></video>`
            : `<img src="${sanitize(src)}" alt="${sanitize(p.name)}" loading="lazy" decoding="async"
                    onerror="this.src='https://images.unsplash.com/photo-1553949333-f3e26e73ce76?w=400'">`;
        const btn = p.aff
            ? `<a href="${sanitize(safeUrl(p.aff))}" target="_blank" rel="noopener noreferrer"
                  class="btn-action btn-affiliate" onclick="event.stopPropagation()">
                   <i class="fas fa-external-link-alt"></i> ${t('buyFromAgent')}</a>`
            : `<button class="btn-action btn-cart"
                       onclick="event.stopPropagation();addToCart(${p.id})">
                   <i class="fas fa-cart-plus"></i> ${t('addToCart')}</button>`;
        return `
            <div class="art-card card-fadein" onclick="navigateToProduct(${p.id})">
                <div class="art-category-badge">${sanitize(tCat(p.category))}</div>
                <div class="art-media">${mediaEl}</div>
                <div class="art-content">
                    <h3 class="art-title">${sanitize(tProd(p,'name'))}</h3>
                    <div class="art-price">${Number(p.price).toLocaleString()} ${t('currency')}</div>
                    ${btn}
                </div>
            </div>`;
    }).join('');
    setTimeout(initAppleAnimations, 60);
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('open');
}

function toggleMobileSearch() {
    const sw = document.getElementById('search-wrapper');
    const isOpen = sw.classList.toggle('mobile-open');
    if (isOpen) {
        setTimeout(() => document.getElementById('smart-search').focus(), 50);
    } else {
        document.getElementById('search-dropdown').classList.remove('active');
    }
}

/* ─────────────────────────────────────────
   7. BLOG ARTICLE — Full Panoramic View
───────────────────────────────────────── */
function openArticle(blogId) {
    const b = db.blogs.find(x => x.id === blogId);
    if (!b) return;

    // Fill hero image
    const heroEl = document.getElementById('article-hero-img');
    if (b.media) {
        heroEl.innerHTML = `<img src="${sanitize(b.media)}" alt="${sanitize(tObj(b,'title')||b.title)}">`;
        heroEl.style.display = 'block';
    } else {
        heroEl.style.display = 'none';
    }

    // Fill content — textContent for XSS safety on desc
    document.getElementById('article-title').textContent = tObj(b,'title') || b.title;
    document.getElementById('article-desc').textContent  = tObj(b,'desc')  || b.desc;

    // Sources
    var srcEl = document.getElementById('article-sources');
    if (srcEl) {
        var srcs = b.sources && b.sources.length ? b.sources : [];
        srcEl.style.display = srcs.length ? '' : 'none';
        srcEl.innerHTML = srcs.length
            ? '<h4 style="font-size:.82rem;font-weight:900;color:var(--dark-blue);margin-bottom:8px;"><i class="fas fa-book-open"></i> المصادر والمراجع</h4>'
              + srcs.map(function(s){
                  var isUrl = /^https?:\/\//.test(s);
                  var parts = s.split('—');
                  var url = parts[0].trim(); var label = parts[1] ? parts[1].trim() : url;
                  return isUrl
                      ? '<a href="'+sanitize(url)+'" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid #e0e8ff;border-radius:8px;color:var(--primary-blue);text-decoration:none;font-size:.8rem;margin-bottom:6px;"><i class="fas fa-external-link-alt"></i>'+sanitize(label)+'</a>'
                      : '<div style="padding:6px 10px;font-size:.8rem;color:#666;">'+sanitize(s)+'</div>';
              }).join('')
            : '';
    }
    // CTA button
    var ctaEl = document.getElementById('article-cta');
    if (ctaEl) {
        if (b.cta && b.ctaUrl) {
            ctaEl.style.display = '';
            ctaEl.href = sanitize(safeUrl(b.ctaUrl));
            ctaEl.textContent = b.cta;
        } else { ctaEl.style.display = 'none'; }
    }

    navigate('article');
}

/* ─────────────────────────────────────────
   8. TOASTS
───────────────────────────────────────── */
function showToast(msg, type = 'success') {
    const c     = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = {
        success: '<i class="fas fa-check-circle" style="color:#2ed573;flex-shrink:0;"></i>',
        error:   '<i class="fas fa-exclamation-circle" style="flex-shrink:0;"></i>',
        info:    '<i class="fas fa-info-circle" style="color:#ffa502;flex-shrink:0;"></i>'
    };
    toast.innerHTML = `${icons[type]||''}<span style="flex:1;text-align:center;">${sanitize(msg)}</span>`;
    c.appendChild(toast);
    setTimeout(() => { if (c.contains(toast)) c.removeChild(toast); }, 3300);
}

/* ─────────────────────────────────────────
   9. MODALS
───────────────────────────────────────── */
function openModal(id)  { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// Close on backdrop click
document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', function(e) {
        if (e.target === this) closeModal(this.id);
    });
});

/* ─────────────────────────────────────────
   10. SMART SEARCH
───────────────────────────────────────── */
function handleSmartSearch(q) {
    var drop = document.getElementById('search-dropdown');
    if (!q || !q.trim()) { if(drop) drop.classList.remove('active'); return; }
    var query = q.trim();

    /* ── Fuzzy scorer ── */
    function _score(str, qry) {
        if (!str) return 0;
        var s = str.toLowerCase(), q2 = qry.toLowerCase();
        if (s === q2)           return 100;
        if (s.startsWith(q2))   return 90;
        if (s.includes(q2))     return 80;
        // Token match: every word in query found in str
        var qTokens = q2.split(/\s+/).filter(Boolean);
        var sTokens = s.split(/\s+/);
        var matched = qTokens.filter(function(qt){
            return sTokens.some(function(st){ return st.includes(qt) || qt.includes(st.slice(0,3)); });
        });
        if (matched.length === qTokens.length) return 70;
        if (matched.length > 0) return 40 + (matched.length / qTokens.length) * 20;
        // Char-level fuzzy: count matching chars
        var hits = 0, pos = 0;
        for (var i=0; i<q2.length; i++) {
            var f = s.indexOf(q2[i], pos);
            if (f >= 0) { hits++; pos = f+1; }
        }
        return hits/q2.length > 0.7 ? 30 : 0;
    }

    /* ── Score each product ── */
    var results = db.products.map(function(p) {
        var nameAr  = p.name || '';
        var nameEn  = (p.translations && p.translations.en && p.translations.en.name) || '';
        var desc    = p.desc || '';
        var cat     = p.category || '';
        var score = Math.max(
            _score(nameAr, query) * 1.5,   // Arabic name (highest weight)
            _score(nameEn, query) * 1.4,   // English name
            _score(cat,    query) * 1.1,   // Category
            _score(desc,   query) * 0.8    // Description
        );
        return { p: p, score: score };
    }).filter(function(r){ return r.score > 0; })
      .sort(function(a,b){ return b.score - a.score; })
      .slice(0, 8);

    /* ── AI-style suggestions if no exact match ── */
    if (!results.length) {
        // Try single chars / partial
        var partial = db.products.filter(function(p){
            var n = (p.name||'').toLowerCase();
            var q2 = query.toLowerCase();
            return q2.split('').filter(function(ch){ return n.includes(ch); }).length > q2.length*0.6;
        }).slice(0,4).map(function(p){ return {p:p, score:10}; });
        results = partial;
    }

    /* ── Render dropdown ── */
    if (!drop) return;
    if (!results.length) {
        drop.innerHTML = '<div style="padding:16px;text-align:center;color:#aaa;font-size:.82rem;">لا نتائج — جرّب كلمات مختلفة</div>';
        drop.classList.add('active');
        return;
    }
    drop.innerHTML = results.map(function(r) {
        var p = r.p;
        var src = (p.media && p.media.trim()) ? p.media : 'https://images.unsplash.com/photo-1553949333-f3e26e73ce76?w=60';
        var name = tProd(p,'name') || p.name || '';
        // Highlight matching part
        var hl = sanitize(name); // highlight disabled for safety
        return '<div class="search-result-item" onclick="closeSearch();openProductDetail('+p.id+')">'
            + '<img src="'+sanitize(src)+'" style="width:42px;height:42px;border-radius:8px;object-fit:cover;flex-shrink:0;">'
            + '<div style="flex:1;min-width:0;">'
            + '<div style="font-size:.84rem;font-weight:800;color:var(--dark-blue);">'+hl+'</div>'
            + '<div style="font-size:.72rem;color:#888;">'+sanitize(tCat(p.category))+'  ·  '+formatPrice(p.price)+'</div>'
            + '</div>'
            + '<span style="font-size:.7rem;color:#ccc;">'+Math.round(r.score)+'%</span>'
            + '</div>';
    }).join('')
    + (db.products.length > 8 ? '<div style="padding:8px 14px;border-top:1px solid #eee;font-size:.72rem;color:#aaa;text-align:center;">نتائج أكثر — جرّب وصف أدق</div>' : '');
    drop.classList.add('active');
}

function closeSearch() {
    var drop = document.getElementById('search-dropdown');
    var overlay = document.getElementById('search-overlay-bg');
    if(drop) drop.classList.remove('active');
    if(overlay) overlay.style.display='none';
    var inp = document.getElementById('search-input');
    if(inp){ inp.value=''; inp.blur(); }
}

// Close search dropdown (desktop) or mobile search panel on outside click
document.addEventListener('click', (e) => {
    const sw        = document.getElementById('search-wrapper');
    const mobileBtn = document.querySelector('.mobile-search-btn');
    // Desktop: close dropdown
    if (!e.target.closest('.search-wrapper')) {
        document.getElementById('search-dropdown').classList.remove('active');
    }
    // Mobile: close the whole panel
    if (sw && sw.classList.contains('mobile-open')) {
        if (!sw.contains(e.target) && (!mobileBtn || !mobileBtn.contains(e.target))) {
            sw.classList.remove('mobile-open');
        }
    }
});

/* ─────────────────────────────────────────
   11. CART
───────────────────────────────────────── */
function addToCart(productId) {
    const p = db.products.find(x => x.id === productId);
    if (!p) return;
    // If already in cart, increase qty
    const existing = shoppingCart.find(i => i.id === productId);
    if (existing) {
        existing.qty = (existing.qty || 1) + 1;
    } else {
        const cartItem = Object.assign({}, p, { qty: 1 });
        shoppingCart.push(cartItem);
    }
    // Track sales for Best Sellers
    p.salesCount = (p.salesCount || 0) + 1;
    saveDb();
    renderShelves();
    document.getElementById('cart-badge').innerText = shoppingCart.length;
    showToast(`${t('addedToCart').replace('🛍️','')} "${sanitize(p.name)}" 🛍️`);
}

function _cartItemName(item) {
    var prod = db.products.find(function(x){ return x.id === item.id; });
    return tObj(prod || item, 'name') || item.name || '';
}


/* ── Payment ── */
let selectedPayment = 'whatsapp';


function detectCardType(num) {
    num = num.replace(/\s/g,'');
    if (/^4/.test(num))           return {icon:'💳', color:'#1a1f71', label:'Visa'};
    if (/^5[1-5]/.test(num)||/^2[2-7]/.test(num)) return {icon:'🔴', color:'#eb001b', label:'Mastercard'};
    if (/^3[47]/.test(num))       return {icon:'🟦', color:'#2557D6', label:'Amex'};
    return {icon:'💳', color:'#94a3b8', label:''};
}

function formatCardNumber(input) {
    let v = input.value.replace(/\D/g,'').slice(0,16);
    input.value = v.replace(/(\d{4})(?=\d)/g,'$1 ');
}
function formatExpiry(input) {
    let v = input.value.replace(/\D/g,'').slice(0,4);
    if (v.length >= 3) v = v.slice(0,2) + ' / ' + v.slice(2);
    input.value = v;
}


function sendOrderWhatsApp() {
    if (!shoppingCart.length) { showToast(t('cartEmptyErr'), "info"); return; }
    const phone = db.settings.whatsapp;
    if (!phone) { showToast(t('noWhatsapp'), "error"); return; }
    let text = `مرحباً MARASSiA 👋\nأريد تأكيد الطلب التالي:\n\n`;
    let total = 0;
    shoppingCart.forEach((item, i) => {
        text += `${i+1}. ${item.name} — ${Number(item.price).toLocaleString()} ${t('currency')}\n`;
        total += sanitizeNum(item.price,999999);
    });
    text += `\n💰 ${t('total')} ${total.toLocaleString()} ${t('currency')}`;
    if (currentUser) text += `\n👤 ${currentUser}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    saveOrderToHistory(shoppingCart);
    shoppingCart = []; document.getElementById('cart-badge').innerText = 0;
    closeModal('cart-modal');
    showToast(t('orderConfirmed'));
}

/* ─────────────────────────────────────────
   12. PRODUCT DETAIL
───────────────────────────────────────── */
function openProductDetail(id) {
    var numId = typeof id === 'string' ? parseInt(id, 10) : id;
    var p = db.products.find(function(x){ return x.id === numId || String(x.id) === String(id); });
    if (!p) return;

    /* ── Media ── */
    var src = (p.media && typeof p.media === 'string' && p.media.trim())
        ? p.media.trim()
        : 'https://images.unsplash.com/photo-1553949333-f3e26e73ce76?w=600';

    var allMedia = [{ src: src, type: p.type || 'img' }];
    if (p.images && p.images.length) {
        p.images.forEach(function(u) {
            if (!u) return;
            var t2 = /\.mp4|\.webm|\.mov|youtube|youtu\.be/i.test(u) ? 'vid' : 'img';
            allMedia.push({ src: u, type: t2 });
        });
    }

    var mediaHTML = '';
    if (allMedia.length > 1) {
        mediaHTML = '<div style="display:flex;overflow-x:auto;gap:8px;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;height:100%;scrollbar-width:none;">'
            + allMedia.map(function(m, i) {
                return m.type === 'vid'
                    ? '<video src="' + sanitize(m.src) + '" ' + (i===0?'autoplay':'') + ' loop controls muted playsinline style="min-width:100%;height:100%;object-fit:cover;scroll-snap-align:start;flex-shrink:0;"></video>'
                    : '<img src="' + sanitize(m.src) + '" alt="" loading="lazy" style="min-width:100%;height:100%;object-fit:cover;scroll-snap-align:start;flex-shrink:0;">';
            }).join('') + '</div>'
            + '<div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);display:flex;gap:5px;">'
            + allMedia.map(function(_,i){ return '<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,' + (i===0?'1':'.5') + ');"></span>'; }).join('')
            + '</div>';
    } else if (p.type === 'vid') {
        mediaHTML = '<video src="' + sanitize(src) + '" autoplay loop controls playsinline style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;"></video>';
    } else {
        mediaHTML = '<img src="' + sanitize(src) + '" alt="" style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;">';
    }

    /* ── Translation badges ── */
    var trLangs = p.translations ? Object.keys(p.translations) : [];
    var langNames = {ar:'🇸🇦 AR',en:'🇬🇧 EN',fr:'🇫🇷 FR',es:'🇪🇸 ES',it:'🇮🇹 IT',de:'🇩🇪 DE',zh:'🇨🇳 ZH'};
    var trBadges = trLangs.length
        ? '<div class="pd-tr-badges">' + trLangs.map(function(l){
            return '<span class="pd-tr-badge" data-lang="' + l + '" data-pid="' + numId + '" onclick="switchPdLang(+this.dataset.pid,this.dataset.lang)">' + (langNames[l]||l) + '</span>';
          }).join('') + '</div>'
        : '';

    /* ── Buttons ── */
    var btn = p.aff
        ? '<a href="' + sanitize(safeUrl(p.aff)) + '" target="_blank" rel="noopener noreferrer" class="btn-action btn-affiliate"><i class="fas fa-external-link-alt"></i> ' + t('buyFromAgent') + '</a>'
        : '<button class="btn-action btn-cart" onclick="addToCart(' + numId + ');closeModal(&quot;product-modal&quot;);"><i class="fas fa-cart-plus"></i> ' + t('addToCart') + '</button>';

    var needsTranslation = !p.translations || Object.keys(p.translations).length < 7;
    var translateBtn = needsTranslation
        ? '<button data-pid="' + numId + '" onclick="_autoTranslateProductAndRefresh(+this.dataset.pid)" style="margin-top:8px;background:var(--primary-blue);color:#fff;border:none;border-radius:9px;padding:7px 16px;cursor:pointer;font-size:.78rem;font-weight:800;width:100%;">🌍 ترجم لـ 7 لغات</button>'
        : '';

    /* ── Reviews ── */
    var revs = getReviews ? getReviews(numId) : [];
    var avg  = revs.length ? (revs.reduce(function(s,r){ return s + r.rating; }, 0) / revs.length).toFixed(1) : null;
    var reviewForm = currentUser
        ? '<div class="rev-form" style="margin-top:14px;padding:14px;background:#f8f9ff;border-radius:12px;">'
            + '<p style="font-size:.8rem;font-weight:900;color:var(--dark-blue);margin-bottom:8px;">⭐ أضف تقييمك</p>'
            + '<div style="display:flex;gap:4px;margin-bottom:10px;"><input type="hidden" id="rev-rating-val" value="5">'
            + [1,2,3,4,5].map(function(n){ return '<span class="rev-star" data-n="' + n + '" onclick="setReviewStar(' + n + ')" style="cursor:pointer;font-size:1.4rem;color:#D4AF37;">★</span>'; }).join('')
            + '</div>'
            + '<textarea id="rev-text" class="form-control" rows="2" placeholder="شاركنا رأيك..." style="resize:none;margin-bottom:8px;"></textarea>'
            + '<button class="btn-main" style="width:100%;padding:9px;" onclick="submitReview(' + numId + ')"><i class="fas fa-paper-plane"></i> إرسال</button>'
            + '</div>'
        : '<div style="text-align:center;padding:16px;background:#f8f9ff;border-radius:12px;margin-top:14px;">'
            + '<i class="fas fa-lock" style="color:var(--primary-blue);font-size:1.3rem;display:block;margin-bottom:8px;"></i>'
            + '<p style="font-size:.82rem;color:#666;">سجّل دخولك لإضافة تقييم</p>'
            + '<button class="btn-main" style="margin-top:8px;padding:8px 20px;" onclick="closeModal(&quot;product-modal&quot;);openModal(&quot;login-modal&quot;)"><i class="fas fa-sign-in-alt"></i> تسجيل الدخول</button>'
            + '</div>';

    /* ── Render ── */
    var cont = document.getElementById('product-detail-content');
    if (!cont) return;

    cont.innerHTML =
        '<div class="pd-media">' + mediaHTML + '</div>'
        + '<div class="pd-info">'
        + '<div class="pd-category">' + sanitize(tCat(p.category)) + '</div>'
        + '<h2 class="pd-title" id="pd-title-el">' + sanitize(tObj(p,'name') || p.name || '') + '</h2>'
        + '<div class="pd-price">' + formatPrice(p.price) + '</div>'
        + trBadges
        + translateBtn
        + '<div class="pd-desc" id="pd-desc-el" style="margin-top:10px;line-height:1.7;color:var(--text-gray);font-size:.88rem;"></div>'
        + btn
        + '</div>';

    var descEl = document.getElementById('pd-desc-el');
    if (descEl) descEl.textContent = tObj(p,'desc') || p.desc || 'لا يوجد وصف إضافي.';

    /* ── QR button (added AFTER cont.innerHTML is set) ── */
    var mediaDiv = cont.querySelector('.pd-media');
    if (mediaDiv) {
        var qrBtn = document.createElement('button');
        qrBtn.title = 'QR Code';
        qrBtn.style.cssText = 'position:absolute;top:8px;left:8px;z-index:10;background:rgba(255,255,255,.9);border:none;border-radius:8px;padding:5px 9px;cursor:pointer;display:flex;align-items:center;gap:5px;font-size:.72rem;color:var(--dark-blue);box-shadow:0 2px 8px rgba(0,0,0,.15);';
        qrBtn.innerHTML = '<i class="fas fa-qrcode"></i>';
        qrBtn.addEventListener('click', function(e){ e.stopPropagation(); openProductQR(numId, e); });
        mediaDiv.appendChild(qrBtn);
    }

    /* ── Reviews section ── */
    var oldRev = document.getElementById('pd-reviews-section');
    if (oldRev) oldRev.remove();

    var revSection = document.createElement('div');
    revSection.id = 'pd-reviews-section';
    revSection.style.cssText = 'padding:20px;border-top:2px solid #f0f0f0;';
    revSection.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
        + '<h3 style="margin:0;font-size:1rem;color:var(--dark-blue);"><i class="fas fa-star" style="color:#D4AF37;margin-left:7px;"></i>تقييمات العملاء</h3>'
        + '<span>' + (avg
            ? '<span style="color:#D4AF37;font-size:1.1rem;">★</span> ' + avg + ' <span style="color:#888;font-size:.82rem;">(' + revs.length + ' تقييم)</span>'
            : '<span style="color:#aaa;font-size:.82rem;">لا توجد تقييمات بعد</span>') + '</span>'
        + '</div>'
        + '<div id="pd-reviews-list"></div>'
        + reviewForm;

    var modalContent = document.querySelector('#product-modal .modal-content');
    if (modalContent) modalContent.appendChild(revSection);

    if (typeof renderReviews === 'function') renderReviews(numId);
    openModal('product-modal');
}



function switchPdLang(productId, langCode) {
    var p = db.products.find(function(x){ return x.id === productId; });
    if (!p) return;
    var prevLang = currentLang;
    currentLang = langCode;
    var titleEl = document.getElementById('pd-title-el');
    var descEl  = document.getElementById('pd-desc-el');
    if (titleEl) titleEl.textContent = tObj(p,'name') || p.name || '';
    if (descEl)  descEl.textContent  = tObj(p,'desc') || p.desc || '';
    // Fix active badge using data-lang attribute
    document.querySelectorAll('.pd-tr-badge').forEach(function(b){
        b.classList.toggle('active', b.dataset.lang === langCode);
    });
    currentLang = prevLang;
    // If no translation exists for this lang, offer to translate
    if (!p.translations || !p.translations[langCode]) {
        var hasAny = p.translations && Object.keys(p.translations).length > 0;
        if (!hasAny) {
            showToast('جارٍ الترجمة التلقائية... ⏳', 'info');
            _autoTranslateProduct(p);
        }
    }
}


/* ─────────────────────────────────────────
   13. USER AUTH
───────────────────────────────────────── */
let _loginTries=0,_loginLock=false;  // kept for compat

/* ═══════════════════════════════════════════════════════════
   MARASSiA AUTH SYSTEM — Firebase Auth + Realtime DB
   Features: Sign Up, Sign In, Sign Out, Forgot Password
             Profile: name, gender, age, country, language
             Activity log (immutable for admin)
   ═══════════════════════════════════════════════════════════ */

let _fbAuth = null;
let _userProfile = null;   // full profile from DB

/* ── Init Auth (called after Firebase init) ── */
function _initAuth() {
    try {
        _fbAuth = firebase.auth();
        _fbAuth.onAuthStateChanged(function(user) {
            if (user) {
                currentUser = user.displayName || user.email.split('@')[0];
                localStorage.setItem('marassia_user_display', currentUser);
                _loadUserProfile(user.uid);
                checkUserLogin();
                closeModal('login-modal');
            } else {
                currentUser = null;
                _userProfile = null;
                localStorage.removeItem('marassia_user_display');
                checkUserLogin();
            }
        });
    } catch(e) { console.warn('[Auth init]', e); }
}

/* ── Load profile from Firebase DB ── */
function _loadUserProfile(uid) {
    if (!fbDB) return;
    fbDB.ref('users/' + uid).once('value').then(function(snap) {
        _userProfile = snap.val() || {};
        initCurrency();
        // Apply preferred language
        if (_userProfile.language && _userProfile.language !== currentLang) {
            applyLang(_userProfile.language);
        }
    });
}

/* ── Save profile to Firebase DB ── */
function _saveUserProfile(uid, data) {
    if (!fbDB) {
        // Fallback: localStorage
        localStorage.setItem('marassia_profile_' + uid, JSON.stringify(data));
        return;
    }
    fbDB.ref('users/' + uid).set(data);
}

/* ── Log activity (immutable append-only) ── */
function _logActivity(uid, action, details) {
    var entry = {
        action:    action,
        details:   details || '',
        timestamp: Date.now(),
        date:      new Date().toLocaleString('ar-EG'),
        userAgent: navigator.userAgent.slice(0, 80)
    };
    if (fbDB) {
        fbDB.ref('activity/' + uid).push(entry);
    }
    // Also keep last 50 in localStorage
    try {
        var key = 'marassia_activity_' + (uid || 'guest');
        var log = JSON.parse(localStorage.getItem(key) || '[]');
        log.unshift(entry);
        if (log.length > 50) log = log.slice(0, 50);
        localStorage.setItem(key, JSON.stringify(log));
    } catch(e) {}
}

/* ── Switch Auth Tab ── */

/* ═══ COUNTRIES LIST (all world, no Israel) ═══ */
const ALL_COUNTRIES = [
    ['PS','Palestine 🇵🇸'],
    ['EG','Egypt 🇪🇬'],
    ['AF','Afghanistan 🇦🇫'],
    ['DZ','Algeria 🇩🇿'],
    ['AR','Argentina 🇦🇷'],
    ['AU','Australia 🇦🇺'],
    ['AT','Austria 🇦🇹'],
    ['BD','Bangladesh 🇧🇩'],
    ['BE','Belgium 🇧🇪'],
    ['BH','Bahrain 🇧🇭'],
    ['BR','Brazil 🇧🇷'],
    ['CA','Canada 🇨🇦'],
    ['KH','Cambodia 🇰🇭'],
    ['CM','Cameroon 🇨🇲'],
    ['CN','China 🇨🇳'],
    ['CO','Colombia 🇨🇴'],
    ['HR','Croatia 🇭🇷'],
    ['CZ','Czech Republic 🇨🇿'],
    ['DK','Denmark 🇩🇰'],
    ['DJ','Djibouti 🇩🇯'],
    ['FI','Finland 🇫🇮'],
    ['FR','France 🇫🇷'],
    ['DE','Germany 🇩🇪'],
    ['GH','Ghana 🇬🇭'],
    ['GR','Greece 🇬🇷'],
    ['HU','Hungary 🇭🇺'],
    ['IN','India 🇮🇳'],
    ['ID','Indonesia 🇮🇩'],
    ['IR','Iran 🇮🇷'],
    ['IQ','Iraq 🇮🇶'],
    ['IT','Italy 🇮🇹'],
    ['JP','Japan 🇯🇵'],
    ['JO','Jordan 🇯🇴'],
    ['KE','Kenya 🇰🇪'],
    ['KR','South Korea 🇰🇷'],
    ['KW','Kuwait 🇰🇼'],
    ['LB','Lebanon 🇱🇧'],
    ['LY','Libya 🇱🇾'],
    ['MY','Malaysia 🇲🇾'],
    ['MV','Maldives 🇲🇻'],
    ['ML','Mali 🇲🇱'],
    ['MR','Mauritania 🇲🇷'],
    ['MX','Mexico 🇲🇽'],
    ['MA','Morocco 🇲🇦'],
    ['MM','Myanmar 🇲🇲'],
    ['NL','Netherlands 🇳🇱'],
    ['NZ','New Zealand 🇳🇿'],
    ['NG','Nigeria 🇳🇬'],
    ['NO','Norway 🇳🇴'],
    ['OM','Oman 🇴🇲'],
    ['PK','Pakistan 🇵🇰'],
    ['PH','Philippines 🇵🇭'],
    ['PL','Poland 🇵🇴'],
    ['PT','Portugal 🇵🇹'],
    ['QA','Qatar 🇶🇦'],
    ['RO','Romania 🇷🇴'],
    ['RU','Russia 🇷🇺'],
    ['SA','Saudi Arabia 🇸🇦'],
    ['SN','Senegal 🇸🇳'],
    ['SG','Singapore 🇸🇬'],
    ['SO','Somalia 🇸🇴'],
    ['ZA','South Africa 🇿🇦'],
    ['ES','Spain 🇪🇸'],
    ['SD','Sudan 🇸🇩'],
    ['SE','Sweden 🇸🇪'],
    ['CH','Switzerland 🇨🇭'],
    ['SY','Syria 🇸🇾'],
    ['TZ','Tanzania 🇹🇿'],
    ['TH','Thailand 🇹🇭'],
    ['TN','Tunisia 🇹🇳'],
    ['TR','Turkey 🇹🇷'],
    ['UA','Ukraine 🇺🇦'],
    ['AE','UAE 🇦🇪'],
    ['GB','United Kingdom 🇬🇧'],
    ['US','United States 🇺🇸'],
    ['UG','Uganda 🇺🇬'],
    ['VN','Vietnam 🇻🇳'],
    ['YE','Yemen 🇾🇪'],
    ['KM','Comoros 🇰🇲'],
    ['OTHER','Other 🌍'],
];

function _populateCountries() {
    var sel = document.getElementById('su-country');
    if (!sel || sel.options.length > 1) return;
    sel.innerHTML = '<option value="">اختر دولتك...</option>';
    ALL_COUNTRIES.forEach(function(c){ sel.innerHTML += '<option value="'+c[0]+'">'+c[1]+'</option>'; });
}

/* Auth label translations */
const AUTH_LABELS = {
    ar: { signin:'تسجيل الدخول', signup:'حساب جديد', welcome:'مرحباً بك في MARASSiA 👋', newAcct:'إنشاء حساب جديد ✨', email:'البريد الإلكتروني', pass:'كلمة المرور', pass2:'تأكيد كلمة المرور', fname:'الاسم الأول', lname:'اسم العائلة', gender:'الجنس', male:'ذكر', female:'أنثى', dob:'تاريخ الميلاد', country:'الدولة', lang:'اللغة المفضلة', forgot:'نسيت كلمة المرور؟', signin_btn:'دخول', signup_btn:'إنشاء الحساب', no_acct:'ليس لديك حساب؟', go_signup:' سجّل الآن', terms:'بالتسجيل توافق على شروط الاستخدام' },
    en: { signin:'Sign In', signup:'Sign Up', welcome:'Welcome to MARASSiA 👋', newAcct:'Create New Account ✨', email:'Email', pass:'Password', pass2:'Confirm Password', fname:'First Name', lname:'Last Name', gender:'Gender', male:'Male', female:'Female', dob:'Date of Birth', country:'Country', lang:'Preferred Language', forgot:'Forgot password?', signin_btn:'Sign In', signup_btn:'Create Account', no_acct:"Don't have an account?", go_signup:' Register now', terms:'By signing up you agree to our Terms' },
    fr: { signin:'Connexion', signup:'Inscription', welcome:'Bienvenue sur MARASSiA 👋', newAcct:'Créer un compte ✨', email:'E-mail', pass:'Mot de passe', pass2:'Confirmer le mot de passe', fname:'Prénom', lname:'Nom', gender:'Genre', male:'Homme', female:'Femme', dob:'Date de naissance', country:'Pays', lang:'Langue préférée', forgot:'Mot de passe oublié ?', signin_btn:'Connexion', signup_btn:'Créer le compte', no_acct:'Pas encore de compte ?', go_signup:' S\'inscrire', terms:'En vous inscrivant vous acceptez nos conditions' },
    es: { signin:'Iniciar sesión', signup:'Registrarse', welcome:'Bienvenido a MARASSiA 👋', newAcct:'Crear cuenta nueva ✨', email:'Correo electrónico', pass:'Contraseña', pass2:'Confirmar contraseña', fname:'Nombre', lname:'Apellido', gender:'Género', male:'Masculino', female:'Femenino', dob:'Fecha de nacimiento', country:'País', lang:'Idioma preferido', forgot:'¿Olvidaste tu contraseña?', signin_btn:'Entrar', signup_btn:'Crear cuenta', no_acct:'¿No tienes cuenta?', go_signup:' Regístrate', terms:'Al registrarte aceptas nuestros términos' },
    de: { signin:'Anmelden', signup:'Registrieren', welcome:'Willkommen bei MARASSiA 👋', newAcct:'Neues Konto erstellen ✨', email:'E-Mail', pass:'Passwort', pass2:'Passwort bestätigen', fname:'Vorname', lname:'Nachname', gender:'Geschlecht', male:'Männlich', female:'Weiblich', dob:'Geburtsdatum', country:'Land', lang:'Bevorzugte Sprache', forgot:'Passwort vergessen?', signin_btn:'Anmelden', signup_btn:'Konto erstellen', no_acct:'Noch kein Konto?', go_signup:' Jetzt registrieren', terms:'Mit der Registrierung stimmen Sie unseren Bedingungen zu' },
    zh: { signin:'登录', signup:'注册', welcome:'欢迎来到 MARASSiA 👋', newAcct:'创建新账户 ✨', email:'电子邮件', pass:'密码', pass2:'确认密码', fname:'名字', lname:'姓氏', gender:'性别', male:'男', female:'女', dob:'出生日期', country:'国家', lang:'首选语言', forgot:'忘记密码？', signin_btn:'登录', signup_btn:'创建账户', no_acct:'还没有账户？', go_signup:' 立即注册', terms:'注册即表示您同意我们的条款' },
};

function _applyAuthLang() {
    var L = AUTH_LABELS[currentLang] || AUTH_LABELS['ar'];
    var s = function(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; };
    s('lbl-signin',   L.signin);    s('lbl-signup',     L.signup);
    s('si-title',     L.welcome);   s('su-title',       L.newAcct);
    s('si-lbl-email', L.email);     s('su-lbl-email',   L.email);
    s('si-lbl-pass',  L.pass);      s('su-lbl-pass',    L.pass);
    s('su-lbl-pass2', L.pass2);     s('su-lbl-fname',   L.fname);
    s('su-lbl-lname', L.lname);     s('su-lbl-gender',  L.gender);
    s('su-lbl-dob',   L.dob);       s('su-lbl-country', L.country);
    s('su-lbl-lang',  L.lang);      s('si-lbl-forgot',  L.forgot);
    s('si-btn',       L.signin_btn);s('su-btn',         L.signup_btn);
    s('si-no-acct',   L.no_acct);   s('si-go-signup',   L.go_signup);
    s('su-terms',     L.terms);
    // Gender options
    var gm=document.getElementById('su-gender-male'); if(gm) gm.textContent=L.male;
    var gf=document.getElementById('su-gender-female'); if(gf) gf.textContent=L.female;
    var gp=document.getElementById('su-gender-placeholder'); if(gp) gp.textContent=(L.gender+'...');
}

/* ── Switch Auth Tab ── */
function switchAuthTab(tab) {
    var siTab=document.getElementById('tab-signin'), suTab=document.getElementById('tab-signup');
    var siDiv=document.getElementById('auth-signin'), suDiv=document.getElementById('auth-signup');
    if (!siTab||!suTab) return;
    if (tab==='signin') {
        siDiv.style.display=''; suDiv.style.display='none';
        siTab.style.background='rgba(255,255,255,.15)'; siTab.style.borderBottomColor='var(--gold)'; siTab.style.color='#fff';
        suTab.style.background='transparent'; suTab.style.borderBottomColor='transparent'; suTab.style.color='rgba(255,255,255,.6)';
    } else {
        _populateCountries();
        siDiv.style.display='none'; suDiv.style.display='';
        suTab.style.background='rgba(255,255,255,.15)'; suTab.style.borderBottomColor='var(--gold)'; suTab.style.color='#fff';
        siTab.style.background='transparent'; siTab.style.borderBottomColor='transparent'; siTab.style.color='rgba(255,255,255,.6)';
        // Set max date for DOB (must be born before today)
        var maxDate = new Date(); maxDate.setFullYear(maxDate.getFullYear()-13);
        var dob=document.getElementById('su-dob'); if(dob) dob.max=maxDate.toISOString().slice(0,10);
    }
    _applyAuthLang();
}

/* ── Toggle password visibility ── */
function togglePassVis(inputId, btn) {
    var inp=document.getElementById(inputId); if(!inp) return;
    var isPass=inp.type==='password';
    inp.type=isPass?'text':'password';
    btn.innerHTML='<i class="fas fa-eye'+(isPass?'-slash':'')+'"></i>';
}

/* ── SIGN IN (email+password, account must exist) ── */
async function handleSignIn() {
    // Ensure _fbAuth is initialized
    if (!_fbAuth) {
        if (typeof firebase !== 'undefined') {
            try {
                if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
                _fbAuth = firebase.auth();
            } catch(initErr) { console.warn('Auth init:', initErr); }
        }
    }
    if (!_fbAuth) {
        // Still null — wait briefly
        showToast('⏳ جارٍ الاتصال...', 'info');
        var waited = 0;
        while (!_fbAuth && waited < 20) {
            await new Promise(function(r){ setTimeout(r, 150); });
            waited++;
            if (!_fbAuth && typeof firebase !== 'undefined') {
                try { _fbAuth = firebase.auth(); } catch(e2){}
            }
        }
        if (!_fbAuth) { _fallbackLogin(); return; }
    }
    var email=(document.getElementById('si-email').value||'').trim();
    var pass=(document.getElementById('si-pass').value||'');
    var emailRx=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(email)) { showToast((AUTH_LABELS[currentLang]||AUTH_LABELS.ar).email+' غير صالح', 'error'); return; }
    if (!pass) { showToast('أدخل كلمة المرور', 'error'); return; }
    try {
        var cred=await _fbAuth.signInWithEmailAndPassword(email, pass);
        _logActivity(cred.user.uid,'sign_in','Device: '+navigator.userAgent.slice(0,60));
        showToast('مرحباً '+(cred.user.displayName||email.split('@')[0])+' 👋');
    } catch(e) {
        var msgs={
            'auth/user-not-found':         'هذا البريد غير مسجّل — أنشئ حساباً جديداً',
            'auth/wrong-password':         'كلمة المرور خاطئة',
            'auth/invalid-credential':     'بريد إلكتروني أو كلمة مرور خاطئة',
            'auth/invalid-login-credentials': 'بريد إلكتروني أو كلمة مرور خاطئة',
            'auth/invalid-email':          'بريد إلكتروني غير صالح',
            'auth/too-many-requests':  'محاولات كثيرة — انتظر قليلاً 🔒',
            'auth/user-disabled':      'هذا الحساب معطّل',
            'auth/network-request-failed': 'خطأ في الاتصال بالإنترنت'
        };
        showToast(msgs[e.code]||('خطأ: '+e.message), 'error');
    }
}

/* ── SIGN UP (full profile) ── */
async function handleSignUp() {
    if (!_fbAuth) {
        if (typeof firebase !== 'undefined') {
            try {
                if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
                _fbAuth = firebase.auth();
            } catch(e2) {}
        }
        if (!_fbAuth) {
            showToast('⏳ جارٍ الاتصال...', 'info');
            var waited = 0;
            while (!_fbAuth && waited < 20) {
                await new Promise(function(r){ setTimeout(r,150); });
                waited++;
                if (!_fbAuth && typeof firebase !== 'undefined') {
                    try { _fbAuth = firebase.auth(); } catch(e3){}
                }
            }
            if (!_fbAuth) { showToast('Firebase غير متصل — تحقق من الإنترنت', 'error'); return; }
        }
    }
    var fname  =(document.getElementById('su-fname').value||'').trim();
    var lname  =(document.getElementById('su-lname').value||'').trim();
    var email  =(document.getElementById('su-email').value||'').trim();
    var pass   =(document.getElementById('su-pass').value||'');
    var pass2  =(document.getElementById('su-pass2').value||'');
    var gender =(document.getElementById('su-gender').value||'');
    var dob    =(document.getElementById('su-dob').value||'');
    var country=(document.getElementById('su-country').value||'');
    var lang   =(document.getElementById('su-lang').value||'ar');

    var emailRx=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!fname)               { showToast('أدخل الاسم الأول', 'error'); return; }
    if (!emailRx.test(email)) { showToast('بريد إلكتروني غير صالح', 'error'); return; }
    if (pass.length < 8)      { showToast('كلمة المرور يجب أن تكون 8 أحرف على الأقل', 'error'); return; }
    if (pass !== pass2)       { showToast('كلمتا المرور غير متطابقتين ❌', 'error'); return; }
    if (!gender)              { showToast('اختر الجنس', 'error'); return; }
    if (!dob)                 { showToast('أدخل تاريخ الميلاد', 'error'); return; }
    if (!country)             { showToast('اختر الدولة', 'error'); return; }

    // Calculate age from DOB
    var today=new Date(), birth=new Date(dob);
    var age=today.getFullYear()-birth.getFullYear()-(today<new Date(today.getFullYear(),birth.getMonth(),birth.getDate())?1:0);

    try {
        var cred=await _fbAuth.createUserWithEmailAndPassword(email, pass);
        await cred.user.updateProfile({ displayName: fname+(lname?' '+lname:'') });
        var profile={
            uid:cred.user.uid, email, firstName:fname, lastName:lname,
            displayName:fname+(lname?' '+lname:''),
            gender, dob, age, country, language:lang,
            createdAt:Date.now(), createdDate:new Date().toLocaleString('ar-EG'), role:'customer'
        };
        _saveUserProfile(cred.user.uid, profile);
        _userProfile=profile;
        if (lang) applyLang(lang);
        _logActivity(cred.user.uid,'sign_up','Country:'+country+' Age:'+age+' Gender:'+gender);
        showToast('تم إنشاء حسابك بنجاح! مرحباً '+fname+' 🎉');
    } catch(e) {
        if (e.code === 'auth/email-already-in-use') {
            showToast('هذا البريد مسجّل مسبقاً ✉️', 'error');
            // Auto-switch to sign-in tab after 1.5s
            setTimeout(function() {
                switchAuthTab('signin');
                var siEmail = document.getElementById('si-email');
                if (siEmail) siEmail.value = email;
                showToast('أدخل كلمة مرورك للدخول 👇', 'info');
            }, 1500);
            return;
        }
        var msgs = {
            'auth/weak-password':  'كلمة المرور ضعيفة — استخدم 8 أحرف أو أكثر',
            'auth/invalid-email':  'بريد إلكتروني غير صالح',
            'auth/network-request-failed': 'خطأ في الاتصال — تحقق من الإنترنت',
            'auth/operation-not-allowed':  'إنشاء الحسابات غير مفعّل — تواصل مع الدعم'
        };
        showToast(msgs[e.code] || ('خطأ في الإنشاء: ' + (e.message||e.code)), 'error');
    }
}

/* ── FORGOT PASSWORD ── */
async function handleForgotPassword() {
    var email = (document.getElementById('si-email').value||'').trim();
    if (!email) {
        // Show inline prompt if email empty
        var siEmail = document.getElementById('si-email');
        if (siEmail) {
            siEmail.style.borderColor = '#ef4444';
            siEmail.focus();
            siEmail.placeholder = 'أدخل بريدك الإلكتروني أولاً...';
            setTimeout(function(){ siEmail.style.borderColor=''; }, 3000);
        }
        showToast('أدخل بريدك الإلكتروني في الحقل أعلاه أولاً', 'error');
        return;
    }
    if (!_fbAuth && typeof firebase !== 'undefined') { try { _fbAuth = firebase.auth(); } catch(e){} }
    if (!_fbAuth) { showToast('Firebase غير متصل', 'error'); return; }
    var btn = document.getElementById('si-lbl-forgot');
    if (btn) { btn.textContent = '⏳ جارٍ الإرسال...'; btn.style.pointerEvents='none'; }
    try {
        await _fbAuth.sendPasswordResetEmail(email);
        showToast('✅ تم إرسال رابط الاستعادة إلى: ' + email + ' — تحقق من Spam إن لم يصل');


        if (btn) { btn.textContent = '✅ تم الإرسال!'; btn.style.color='#22c55e'; }
    } catch(e) {
        var errMsg = e.code === 'auth/user-not-found' ? 'هذا البريد غير مسجّل في الموقع'
                   : e.code === 'auth/invalid-email'  ? 'بريد إلكتروني غير صالح'
                   : e.code === 'auth/network-request-failed' ? 'خطأ في الاتصال'
                   : 'خطأ في الإرسال: ' + (e.code||e.message);
        showToast(errMsg, 'error');
        if (btn) { btn.textContent = 'نسيت كلمة المرور؟'; btn.style.pointerEvents=''; }
    }
}

function handleLogout() {
    var uid = _fbAuth && _fbAuth.currentUser ? _fbAuth.currentUser.uid : null;
    if (uid) _logActivity(uid, 'sign_out', '');
    if (_fbAuth) {
        _fbAuth.signOut().then(function() {
            currentUser = null; _userProfile = null;
            localStorage.removeItem('marassia_user');
            document.getElementById('admin-modal')?.classList.remove('active');
            checkUserLogin();
            showToast(t('loggedOut'), 'info');
        });
    } else {
        currentUser = null;
        localStorage.removeItem('marassia_user');
        checkUserLogin();
        showToast(t('loggedOut'), 'info');
    }
}

/* ── FORGOT PASSWORD ── */

/* ── Fallback login (if Firebase not connected) ── */
function _fallbackLogin() {
    var email = (document.getElementById('si-email').value || document.getElementById('su-email').value || '').trim();
    var emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(email)) { showToast('بريد إلكتروني غير صالح', 'error'); return; }
    currentUser = email.split('@')[0].replace(/[^a-zA-Z0-9\u0600-\u06FF_\-]/g,'').slice(0,20);
    localStorage.setItem('marassia_user', currentUser);
    checkUserLogin();
    closeModal('login-modal');
    showToast(t('welcome') + ' ' + sanitize(currentUser) + '! 👋');
}


function checkUserLogin() {
    const greetEl   = document.getElementById('user-name-display');
    const triggerEl = document.getElementById('login-trigger');
    const logoutEl  = document.getElementById('logout-btn');
    // Sidebar elements
    const sideCard  = document.getElementById('side-user-card');
    const sideLogin = document.getElementById('side-li-login');
    const sideNameT = document.getElementById('side-user-name-txt');
    const sideAvatarEl = document.getElementById('side-user-avatar');

    const histTrigger = document.getElementById('history-trigger');

    if (currentUser) {
        // Header: show name + history icon + logout, hide login icon
        triggerEl.style.display = 'none';
        logoutEl.classList.add('active');
        if (histTrigger) histTrigger.style.display = '';
        greetEl.textContent = currentUser;
        greetEl.classList.add('active');

        // Sidebar: show user card, hide login link
        sideCard.classList.add('visible');
        sideLogin.style.display = 'none';
        sideNameT.textContent = currentUser;
        // First letter as avatar
        const letter = currentUser.charAt(0).toUpperCase();
        sideAvatarEl.textContent = /[A-Za-z]/.test(letter) ? letter : '👤';
    } else {
        // Header: show login icon, hide name + history + logout
        triggerEl.style.display = '';
        logoutEl.classList.remove('active');
        if (histTrigger) histTrigger.style.display = 'none';
        greetEl.classList.remove('active');

        // Sidebar: hide user card, show login link
        sideCard.classList.remove('visible');
        sideLogin.style.display = '';
    }
}

/* ─────────────────────────────────────────
   14. PURCHASE HISTORY
───────────────────────────────────────── */
function saveOrderToHistory(items) {
    if (!currentUser || !items.length) return;
    const key = `marassia_history_${currentUser}`;
    let history = [];
    try { history = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
    history.unshift({
        date: new Date().toLocaleString('ar-EG'),
        items: items.map(p => ({ id: p.id, name: p.name, price: p.price, media: p.media })),
        total: items.reduce((s, p) => s + parseInt(p.price, 10), 0)
    });
    // keep max 50 orders
    if (history.length > 50) history = history.slice(0, 50);
    try { localStorage.setItem(key, JSON.stringify(history)); } catch(e) {}
}

function openHistoryModal() {
    const container = document.getElementById('history-content');
    if (!currentUser) {
        container.innerHTML = `<div class="history-empty"><i class="fas fa-lock"></i>${t('login')}</div>`;
        openModal('history-modal'); return;
    }
    const key = `marassia_history_${currentUser}`;
    let history = [];
    try { history = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}

    if (!history.length) {
        container.innerHTML = `
            <div class="history-empty">
                <i class="fas fa-shopping-bag"></i>
                <h3 style="margin-bottom:8px;">${t('historyEmpty')}</h3>
                <p style="font-size:.9rem;">${t('historyEmptySub')}</p>
            </div>`;
    } else {
        container.innerHTML = history.map((order, i) => `
            <div class="history-order">
                <div class="history-order-header">
                    <span class="history-order-date">
                        <i class="fas fa-calendar-alt" style="color:var(--primary-blue);"></i>
                        ${t('order')} #${history.length - i} &nbsp;|&nbsp; ${sanitize(order.date)}
                    </span>
                    <span class="history-order-total">
                        ${Number(order.total).toLocaleString()} ${t('currency')}
                    </span>
                </div>
                ${order.items.map(item => `
                    <div class="history-order-item">
                        <img src="${sanitize(item.media)}"
                             onerror="this.src='https://images.unsplash.com/photo-1553949333-f3e26e73ce76?w=80'"
                             alt="">
                        <div>
                            <div class="history-order-item-name">${sanitize(item.name)}</div>
                            <div class="history-order-item-price">${Number(item.price).toLocaleString()} ${t('currency')}</div>
                        </div>
                    </div>`).join('')}
            </div>`).join('');
    }
    openModal('history-modal');
}

/* ─────────────────────────────────────────
   14. ADMIN
───────────────────────────────────────── */

/* ── Internal config ── */
const _k = [127,113,99,35,98,53,121,34,97,32,50,50,46,112,98,37,98,49,46,36,52,116,96,96,120,112,55,115,49,97,44,113,96,113,98,98,47,117,97,114,102,107,44,32,96,121,107,50,127,39,103,34,106,53,41,113,106,117,102,98,117,112,96,32];
const _dk = [0x4d,0x41,0x52,0x41,0x53,0x53];
function _rk() { return _k.map((v,i)=>String.fromCharCode(v^_dk[i%_dk.length])).join(''); }

async function _sha256(str){
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
let _adminTries=0, _adminLocked=false;

function openAdminPanel(){ window.location.href='/admin.html'; }

async function submitAdminPass(){
    const pass = document.getElementById('admin-pass-input').value;
    if (!pass) return;
    const hash = await _sha256(pass);
    if(hash === _rk()){
        _adminTries = 0;
        document.getElementById('admin-pass-modal').classList.remove('active');
        document.getElementById('admin-modal').classList.add('active');
        updateAdminUI();
        refreshLinksAdmin();
        refreshChannelAdminList();
        renderReviewsAdmin();
        refreshSidebarItemsAdmin();
        updateIntroAdminUI();
    } else {
        _adminTries++;
        document.getElementById('admin-pass-input').value = '';
        document.getElementById('admin-pass-input').focus();
        if(_adminTries >= 5){
            _adminLocked = true;
            document.getElementById('admin-pass-modal').classList.remove('active');
            showToast("5 محاولات فاشلة! تجميد 30 ثانية 🔒","error");
            setTimeout(()=>{ _adminLocked=false; _adminTries=0; }, 30000);
        } else {
            const err = document.getElementById('admin-pass-err');
            err.textContent = `كود خاطئ! (${5-_adminTries} محاولات متبقية)`;
            err.style.display = 'block';
            setTimeout(()=>err.style.display='none', 2500);
        }
    }
}

function closeAdminPanel() {
    document.getElementById('admin-modal').classList.remove('active');
}

function switchAdminTab(tabId, el) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    document.getElementById(`admin-${tabId}`).classList.add('active');
}

function updateAdminUI() {
    // ── 1. Product categories select ──────────────────
    var pcatEl = document.getElementById('p-cat');
    if (pcatEl && db.categories && db.categories.length) {
        var catGroups = {
            'مطبخ ومنزل': ['Kitchen Finds','Home Finds','آثاث'],
            'إلكترونيات':  ['إلكترونيات','اكسسوارات إلكترونيات'],
            'صحة وجمال':   ['صحة وتجميل'],
            'ملابس':       ['ملابس رجالي','ملابس حريمي','ملابس أطفال بناتي','ملابس أطفال ولادي'],
            'اكسسوارات':   ['ساعات','مجوهرات وإكسسوارات','حقائب'],
            'طبي':         ['طبي ودواء'],
        };
        var used = new Set();
        var html = '';
        Object.keys(catGroups).forEach(function(grp){
            var gc = catGroups[grp].filter(function(c){ return db.categories.indexOf(c)!==-1; });
            if(gc.length){
                html+='<optgroup label="── '+grp+' ──">';
                gc.forEach(function(c){ used.add(c); html+='<option value="'+sanitize(c)+'">'+sanitize(typeof tCat==="function"?tCat(c):c)+'</option>'; });
                html+='</optgroup>';
            }
        });
        var others = db.categories.filter(function(c){ return !used.has(c); });
        if(others.length){
            html+='<optgroup label="── أخرى ──">';
            others.forEach(function(c){ html+='<option value="'+sanitize(c)+'">'+sanitize(typeof tCat==="function"?tCat(c):c)+'</option>'; });
            html+='</optgroup>';
        }
        pcatEl.innerHTML = html || '<option value="">لا توجد أقسام</option>';
    }

    // ── 2. Categories cards grid ──────────────────────
    var catGrid = document.getElementById('cat-cards-grid');
    var catBadge = document.getElementById('cat-count-badge');
    if(catGrid){
        var cats = db.categories || [];
        if(catBadge) catBadge.textContent = cats.length+' قسم';
        var CAT_ICON_MAP = {'Kitchen Finds':'fas fa-utensils','Home Finds':'fas fa-home','آثاث':'fas fa-couch','إلكترونيات':'fas fa-laptop','اكسسوارات إلكترونيات':'fas fa-plug','صحة وتجميل':'fas fa-heart','ملابس رجالي':'fas fa-tshirt','ملابس حريمي':'fas fa-female','ملابس أطفال بناتي':'fas fa-child','ملابس أطفال ولادي':'fas fa-child','ساعات':'fas fa-clock','مجوهرات وإكسسوارات':'fas fa-gem','حقائب':'fas fa-shopping-bag','طبي ودواء':'fas fa-pills'};
        var GRADS = ['linear-gradient(135deg,#0a1628,#1a3a5c)','linear-gradient(135deg,#0d1f10,#1a4020)','linear-gradient(135deg,#1a0e03,#3d2008)','linear-gradient(135deg,#0d0520,#1e0a45)','linear-gradient(135deg,#1a0303,#3d0808)','linear-gradient(135deg,#03111a,#072838)'];
        if(!cats.length){
            catGrid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--adm-muted,#6b7a99);"><i class="fas fa-tags" style="font-size:2rem;margin-bottom:8px;display:block;opacity:.4;"></i>لا توجد أقسام — أضف أو اضغط استعادة الافتراضيات</div>';
        } else {
            catGrid.innerHTML=cats.map(function(cat,i){
                var icon=CAT_ICON_MAP[cat]||'fas fa-tag';
                var cnt=(db.products||[]).filter(function(p){return p.category===cat;}).length;
                var grad=GRADS[i%GRADS.length];
                return '<div style="background:'+grad+';border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:16px;position:relative;">'
                    +'<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;">'
                    +'<i class="'+sanitize(icon)+'" style="font-size:1.5rem;color:rgba(255,255,255,.7);"></i>'
                    +'<div style="display:flex;gap:3px;">'
                    +(i>0?'<button onclick="moveCategoryUp('+i+')" style="background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:6px;width:24px;height:24px;cursor:pointer;font-size:.7rem;">▲</button>':
                          '<button style="background:rgba(255,255,255,.04);border:none;color:rgba(255,255,255,.2);border-radius:6px;width:24px;height:24px;font-size:.7rem;" disabled>▲</button>')
                    +(i<cats.length-1?'<button onclick="moveCategoryDown('+i+')" style="background:rgba(255,255,255,.1);border:none;color:#fff;border-radius:6px;width:24px;height:24px;cursor:pointer;font-size:.7rem;">▼</button>':
                                      '<button style="background:rgba(255,255,255,.04);border:none;color:rgba(255,255,255,.2);border-radius:6px;width:24px;height:24px;font-size:.7rem;" disabled>▼</button>')
                    +'<button onclick="deleteCategory('+i+')" style="background:rgba(239,68,68,.2);border:none;color:#fca5a5;border-radius:6px;width:24px;height:24px;cursor:pointer;font-size:.7rem;">🗑</button>'
                    +'</div></div>'
                    +'<div style="font-weight:800;font-size:.88rem;color:#fff;margin-bottom:3px;">'+sanitize(cat)+'</div>'
                    +'<div style="font-size:.7rem;color:rgba(255,255,255,.4);">'+cnt+' منتج</div>'
                    +'</div>';
            }).join('');
        }
    }

    // ── 3. Products table ─────────────────────────────
    var prodTable = document.getElementById('prod-table');
    if(prodTable){
        var prods = db.products||[];
        if(!prods.length){
            prodTable.innerHTML='<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--adm-muted,#6b7a99);"><i class="fas fa-box-open" style="display:block;font-size:2rem;margin-bottom:8px;opacity:.4;"></i>لا توجد منتجات — أضف منتجك الأول أعلاه</td></tr>';
        } else {
            prodTable.innerHTML='<tr><th>المنتج</th><th>السعر</th><th>القسم</th><th>VIP</th><th>إجراء</th></tr>'
                +prods.map(function(p){
                    var nm=(p.translations&&p.translations.ar&&p.translations.ar.name)||p.name||'';
                    var pr=typeof formatPrice==='function'?formatPrice(p.price):('$'+p.price);
                    return '<tr>'
                        +'<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;">'+sanitize(nm)+'</td>'
                        +'<td>'+pr+'</td>'
                        +'<td style="font-size:.78rem;">'+sanitize(p.category||'—')+'</td>'
                        +'<td style="text-align:center;">'+(p.vip?'👑':'—')+'</td>'
                        +'<td style="white-space:nowrap;">'
                        +'<button class="btn-del" onclick="editProduct('+p.id+')" style="background:rgba(61,122,255,.12);color:#7ab0ff;border-color:rgba(61,122,255,.25);margin-left:4px;" title="تعديل"><i class="fas fa-edit"></i></button>'
                        +'<button class="btn-del" onclick="deleteProduct('+p.id+')" title="حذف"><i class="fas fa-trash"></i></button>'
                        +'</td></tr>';
                }).join('');
        }
    }

    // ── 4. Blog table ─────────────────────────────────
    var blogTable = document.getElementById('blog-table');
    if(blogTable){
        var blogs = db.blogs||[];
        if(!blogs.length){
            blogTable.innerHTML='<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--adm-muted,#6b7a99);">لا توجد مقالات بعد</td></tr>';
        } else {
            blogTable.innerHTML='<tr><th>العنوان</th><th>التاريخ</th><th>إجراء</th></tr>'
                +blogs.map(function(b,i){
                    return '<tr>'
                        +'<td style="font-weight:700;">'+sanitize(b.title||'')+'</td>'
                        +'<td style="font-size:.78rem;">'+sanitize(b.date||'')+'</td>'
                        +'<td><button class="btn-del" onclick="deleteBlog('+i+')"><i class="fas fa-trash"></i></button></td>'
                        +'</tr>';
                }).join('');
        }
    }

    // ── 5. Hero fields ────────────────────────────────
    var h = (db.settings&&db.settings.hero)||{};
    var heroFields = {'hero-title-input':'title','hero-sub-input':'subtitle','hero-media-url':'media'};
    Object.keys(heroFields).forEach(function(id){
        var el=document.getElementById(id); if(el) el.value=h[heroFields[id]]||'';
    });
    var htEl = document.querySelector('input[name="hero-type"][value="'+(h.type||'text')+'"]');
    if(htEl) htEl.checked=true;

    // ── 6. Settings fields ───────────────────────────
    var smap = {
        'set-logo':     (db.settings&&db.settings.logo)       || '',
        'set-wa':       (db.settings&&db.settings.whatsapp)   || '',
        'set-instapay': (db.payment &&db.payment.instapay)    || '',
        'set-vodafone': (db.payment &&db.payment.vodafone)    || '',
        'set-stripe':   (db.payment &&db.payment.stripe)      || '',
    };
    Object.keys(smap).forEach(function(id){
        var el=document.getElementById(id);
        if(el && el.tagName!=='BUTTON') el.value=smap[id];
    });

    // ── 7. Social fields ─────────────────────────────
    var socmap = {
        'set-fb': (db.social&&db.social.fb)||'',
        'set-yt': (db.social&&db.social.yt)||'',
        'set-ig': (db.social&&db.social.ig)||'',
        'set-tt': (db.social&&db.social.tt)||'',
        'set-pin':(db.social&&db.social.pin)||'',
        'set-wa-ch':(db.social&&db.social.waCh)||'',
    };
    Object.keys(socmap).forEach(function(id){
        var el=document.getElementById(id);
        if(el && el.tagName!=='BUTTON') el.value=socmap[id];
    });

    // ── 8. About us ───────────────────────────────────
    var aboutEl=document.getElementById('set-about-text');
    if(aboutEl && db.settings) aboutEl.value=db.settings.aboutUs||'';

    // ── 9. Channel videos list ────────────────────────
    var chList = document.getElementById('ch-admin-list');
    if(chList){
        var vids = db.channel||[];
        if(!vids.length){
            chList.innerHTML='<p style="color:var(--adm-muted,#6b7a99);text-align:center;padding:20px;">لا توجد فيديوهات بعد</p>';
        } else {
            chList.innerHTML=vids.map(function(v,i){
                return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);">'
                    +'<div style="flex:1;"><div style="font-weight:700;font-size:.82rem;color:var(--at,#e8eeff);">'+sanitize(v.title||'')+'</div>'
                    +'<div style="font-size:.72rem;color:var(--adm-muted,#6b7a99);" dir="ltr">'+sanitize(v.url||'')+'</div></div>'
                    +'<button class="btn-del" onclick="deleteChannelVideo('+i+')"><i class="fas fa-trash"></i></button>'
                    +'</div>';
            }).join('');
        }
    }
}

function updateSocialPreview() {
    const s = db.social;
    const chips = [
        { key:'fb',  label:'Facebook',   bg:'#1877F2', icon:'fab fa-facebook-f'  },
        { key:'yt',  label:'YouTube',    bg:'#FF0000', icon:'fab fa-youtube'      },
        { key:'ig',  label:'Instagram',  bg:'#E4405F', icon:'fab fa-instagram'    },
        { key:'tt',  label:'TikTok',     bg:'#111',    icon:'fab fa-tiktok'       },
        { key:'pin', label:'Pinterest',  bg:'#E60023', icon:'fab fa-pinterest-p'  }
    ];
    document.getElementById('social-preview').innerHTML = chips
        .filter(ch => s[ch.key] && /^https?:\/\//i.test(s[ch.key]))
        .map(ch =>
            `<span class="social-preview-chip" style="background:${ch.bg};">
                 <i class="${ch.icon}"></i> ${ch.label}
             </span>`).join('') || `<span style="color:#aaa;font-size:.85rem;">لا توجد روابط مضافة</span>`;
}

/* ── Save Functions ── */

function deleteProduct(id){
    if(!confirm("هل تريد حذف هذا المنتج نهائياً؟")) return;
    db.products=db.products.filter(function(p){return p.id!==id;});
    saveDb(); updateAdminUI(); showToast("✅ تم حذف المنتج");
}
function saveProduct(e) {
    e.preventDefault();
    const fi   = document.getElementById('p-media-file');
    const type = document.getElementById('p-type').value;
    if (fi.files.length > 0) {
        if (type === 'vid') {
            // Video: read as data URL
            const reader = new FileReader();
            reader.onload  = ev  => finalizeSaveProduct(ev.target.result);
            reader.onerror = ()  => finalizeSaveProduct(document.getElementById('p-media').value.trim()||'');
            reader.readAsDataURL(fi.files[0]);
        } else {
            compressImage(fi.files[0], c => finalizeSaveProduct(c || ''));
        }
    } else {
        finalizeSaveProduct(document.getElementById('p-media').value.trim() ||
            'https://images.unsplash.com/photo-1553949333-f3e26e73ce76?w=600');
    }
}
async function finalizeSaveProduct(mediaSrc) {
    const now  = Date.now();
    const name = document.getElementById('p-name').value.trim();
    const desc = document.getElementById('p-desc').value.trim();
    var extraMedia = [];
    try {
        var extras = document.getElementById('p-extra-media');
        if (extras && extras.value.trim()) {
            extraMedia = extras.value.trim().split(String.fromCharCode(10))
                .map(function(u){ return u.trim(); })
                .filter(function(u){ return u.length > 5; });
        }
    } catch(e) {}
    var prod = {
        id:now, addedAt:now, name, desc,
        price:    parseInt(document.getElementById('p-price').value,10)||0,
        category: document.getElementById('p-cat').value,
        type:     document.getElementById('p-type').value,
        media:    mediaSrc,
        images:   extraMedia,  // additional images array
        aff:      document.getElementById('p-aff').value.trim(),
        salesCount:0, salesDate: new Date().toISOString().slice(0,7),
        translations:{},
        vip:      !!(document.getElementById('p-vip')&&document.getElementById('p-vip').checked),
        trending: parseInt(((document.getElementById('p-trending')||{}).value)||0)||0,
        quality:  ((document.getElementById('p-quality')||{}).value)||''
    };
    var form = document.querySelector('#admin-prod form');
    var editId = form && form.dataset.editId ? parseInt(form.dataset.editId) : null;
    if (editId) {
        var idx = db.products.findIndex(function(x){ return x.id === editId; });
        if (idx > -1) {
            prod.id = editId;
            prod.addedAt = db.products[idx].addedAt;
            prod.salesCount = db.products[idx].salesCount || 0;
            prod.salesDate  = db.products[idx].salesDate  || prod.salesDate;
            prod.reviews    = db.products[idx].reviews;
            prod.translations = db.products[idx].translations || {};
            db.products[idx] = prod;
        }
        delete form.dataset.editId;
        var btn = form.querySelector('button[type="submit"]');
        if (btn) btn.innerHTML = '<i class="fas fa-plus"></i> ' + t('productSaved');
        showToast('✅ تم تعديل المنتج');
    } else {
        db.products.unshift(prod);
        showToast(t('productSaved'));
        _autoTranslateProduct(prod);
    }
    form.reset();
    var _vEl=document.getElementById('p-vip'); if(_vEl&&typeof editingProductId!=='undefined'){var pi=db.products.find(function(x){return x.id===editingProductId;}); if(pi){pi.vip=_vEl.checked;pi.trending=parseInt((document.getElementById('p-trending')||{}).value)||0;pi.quality=(document.getElementById('p-quality')||{}).value||''; }}
        saveDb();
    if(document.getElementById('products-grid')) { renderProductsGrid(); renderCategoryBar(); renderShelves(); renderBestSellers(); }
    updateAdminUI();
}

function _autoTranslateProduct(p){
    var ctx = p.category ? 'E-commerce product in category: ' + p.category : 'E-commerce product';
    _autoTranslateObj(p,['name','desc'],function(){ renderProductsGrid(); renderShelves(); renderCategoryBar(); }, ctx);
}

async function saveCategory(e){
    e.preventDefault();
    const n=document.getElementById('new-cat-name').value.trim();
    if(!n){ showToast('اسم القسم مطلوب!','error'); return; }
    if(db.categories.includes(n)){ showToast('القسم موجود بالفعل!','error'); return; }
    db.categories.push(n);
    document.getElementById('new-cat-name').value='';
    saveDb(); renderCategoryBar(); updateAdminUI();
    showToast(t('catAdded'));
    _autoTranslateCategory(n);
}


function retranslateCategory(arName) {
    // Clear existing translations for this category
    ['en','fr','es','it','de','zh'].forEach(function(lang){
        if (LANGS[lang] && LANGS[lang].catNames) delete LANGS[lang].catNames[arName];
    });
    showToast('⏳ جارٍ ترجمة: ' + arName, 'info');
    _autoTranslateCategory(arName);
    setTimeout(updateAdminUI, 500);
}

async function translateAllCategories() {
    var langs = ['en','fr','es','it','de','zh'];
    var untranslated = db.categories.filter(function(cat){
        return langs.some(function(l){
            return !LANGS[l] || !LANGS[l].catNames || !LANGS[l].catNames[cat] || LANGS[l].catNames[cat] === cat;
        });
    });
    if (!untranslated.length) { showToast('✅ كل الأقسام مترجمة!', 'success'); return; }
    showToast('⏳ جارٍ ترجمة ' + untranslated.length + ' قسم...', 'info');
    for (var i = 0; i < untranslated.length; i++) {
        await _autoTranslateCategory(untranslated[i]);
        await new Promise(function(r){ setTimeout(r, 350); });
    }
    renderCategoryBar();
    updateAdminUI();
    showToast('🎉 تمت ترجمة كل الأقسام!', 'success');
}

async function _autoTranslateCategory(arName){
    // Use Google Translate (free, no API key needed)
    var langMap = {en:'en',fr:'fr',es:'es',it:'it',de:'de',zh:'zh-CN'};
    var langs = ['en','fr','es','it','de','zh'];
    var success = 0;
    showToast('⏳ جارٍ ترجمة القسم: ' + arName, 'info');
    for (var i = 0; i < langs.length; i++) {
        var lang = langs[i];
        var tgtCode = langMap[lang];
        try {
            var translated = await _smartTranslate(arName, tgtCode, 'ar');
            if (translated && translated !== arName) {
                if (LANGS[lang] && LANGS[lang].catNames) {
                    LANGS[lang].catNames[arName] = translated;
                    success++;
                }
            }
        } catch(e) { console.warn('[cat translate]', lang, e); }
        await new Promise(function(r){ setTimeout(r, 80); });
    }
    if (success > 0) {
        renderCategoryBar();
        showToast('✅ ترجمة القسم لـ ' + success + ' لغات 🌍');
    }
}

function deleteCategory(i) {
    const name = db.categories[i];
    if (!confirm(`حذف قسم "${name}"؟`)) return;
    db.categories.splice(i, 1);
    if (currentCat === name) currentCat = 'الكل';
    saveDb(); renderCategoryBar(); renderProductsGrid(); updateAdminUI();
    showToast("تم حذف القسم", "info");
}

function saveAboutUs(e) {
    e.preventDefault();
    db.settings.aboutUs = document.getElementById('set-about-text').value;
    saveDb(); renderAboutUs();
    showToast(t('aboutSaved'));
}

/* ── Hero Save ── */
function saveHero(e) {
    e.preventDefault();
    const type  = document.querySelector('input[name="hero-type"]:checked')?.value || 'text';
    const title = document.getElementById('hero-title-input').value.trim() || 'MARASSiA';
    const sub   = document.getElementById('hero-sub-input').value.trim()   || 'تجربة تسوق فاخرة تفوق الخيال';
    const fi    = document.getElementById('hero-media-file');
    const urlIn = document.getElementById('hero-media-url').value.trim();

    const finalize = (mediaSrc) => {
        db.settings.hero = { type, title, subtitle: sub, media: mediaSrc };
        saveDb(); renderHero();
        showToast(t('heroSaved'));
    };

    if (type !== 'text' && fi.files.length > 0) {
        if (type === 'image') {
            compressImage(fi.files[0], (c) => finalize(c || urlIn || ''));
        } else {
            // video: read as data URL
            const reader = new FileReader();
            reader.onload = (ev) => finalize(ev.target.result);
            reader.onerror = () => finalize(urlIn || '');
            reader.readAsDataURL(fi.files[0]);
        }
    } else {
        finalize(urlIn || '');
    }
}

/* Hero live preview in admin */
function heroAdminPreview() {
    const type  = document.querySelector('input[name="hero-type"]:checked')?.value || 'text';
    const title = document.getElementById('hero-title-input').value || 'MARASSiA';
    const sub   = document.getElementById('hero-sub-input').value   || '';
    const strip = document.getElementById('hero-preview-strip');
    const img   = document.getElementById('hero-preview-img');
    const vid   = document.getElementById('hero-preview-vid');
    const ms    = document.getElementById('hero-media-section');

    ms.style.display    = type !== 'text' ? '' : 'none';
    document.getElementById('hp-title').textContent = title;
    document.getElementById('hp-sub').textContent   = sub;

    const urlVal = document.getElementById('hero-media-url').value.trim();
    if (type !== 'text' && urlVal) {
        strip.style.display = '';
        if (type === 'image') { img.src = urlVal; img.style.display='block'; vid.style.display='none'; }
        else                  { vid.src = urlVal; vid.style.display='block'; img.style.display='none'; }
    } else if (type !== 'text') {
        strip.style.display = '';
        img.style.display = vid.style.display = 'none';
    } else {
        strip.style.display = 'none';
    }
}

function saveSocialLinks(e) {
    e.preventDefault();
    db.social.fb  = document.getElementById('set-fb').value.trim();
    db.social.yt  = document.getElementById('set-yt').value.trim();
    db.social.ig  = document.getElementById('set-ig').value.trim();
    db.social.tt  = document.getElementById('set-tt').value.trim();
    db.social.pin = document.getElementById('set-pin').value.trim();
    saveDb();
    renderSidebarSocial();  // FIX #7 — only re-render what changed
    updateSocialPreview();
    showToast(t('socialSaved'));
}

function saveSettings(e) {
    e.preventDefault();
    db.settings.logo     = document.getElementById('set-logo').value.trim() || "MARASSiA";
    db.settings.whatsapp = document.getElementById('set-wa').value.replace(/\D/g, '');
    if (!db.payment) db.payment = {};
    db.payment.instapay  = document.getElementById('set-instapay').value.trim();
    db.payment.vodafone  = document.getElementById('set-vodafone').value.trim();
    // Save API Key
    var akInput = document.getElementById('set-apikey');
    if (akInput && akInput.value.trim() && !akInput.value.startsWith('•')) {
        db.settings.apiKey = akInput.value.trim();
        localStorage.setItem('marassia_api_key', db.settings.apiKey);
        akInput.value = '';
        akInput.placeholder = '✓ محفوظ (sk...' + db.settings.apiKey.slice(-4) + ')';
        var st = document.getElementById('apikey-status');
        if (st) { st.textContent = '✅ API Key محفوظ — AI جاهز للعمل'; }
    }
    // Payment links
    var ppEl=document.getElementById('set-paypal'); if(ppEl) db.settings.paypalLink=ppEl.value.trim();
    var btEl=document.getElementById('set-bitcoin'); if(btEl) db.settings.bitcoinAddress=btEl.value.trim();
    saveDb(); renderLogo(); renderHero();
    showToast(t('settingsSaved'));
}

function factoryReset() {
    if (!confirm("⚠️ سيُحذف كل شيء!\nهل أنت متأكد 100%؟")) return;
    localStorage.removeItem('marassia_v2');
    localStorage.removeItem('marassia_user');
    location.reload();
}

/* ─────────────────────────────────────────
   15. APPLE ANIMATIONS — Intersection Observer
───────────────────────────────────────── */
const scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(en => {
        if (en.isIntersecting) {
            en.target.classList.add('apple-show');
            scrollObserver.unobserve(en.target); // once shown → never hide again
        }
    });
}, { threshold: 0.05, rootMargin: "0px 0px -40px 0px" });

function initAppleAnimations() { if(!document.getElementById('main-hero')) return;
    const run = () => document.querySelectorAll('.apple-hide').forEach(el => scrollObserver.observe(el));
    if ('requestIdleCallback' in window) requestIdleCallback(run, {timeout:400});
    else setTimeout(run, 50);
}

/* ─────────────────────────────────────────
   16. SCROLL — Shrink header
───────────────────────────────────────── */
let _st=false;
window.addEventListener('scroll',()=>{
    if(!_st){ requestAnimationFrame(()=>{ document.getElementById('main-header').classList.toggle('scrolled',window.scrollY>28); _st=false; }); _st=true; }
},{ passive:true });

/* ─────────────────────────────────────────
   17. BOOT
───────────────────────────────────────── */
window.onload = initializeApp;

/* ═══════════════════════════════════════════════
   PWA — Progressive Web App Engine
   Single-file approach: Manifest + SW via Blob URLs
═══════════════════════════════════════════════ */
(function() {

/* ── App Manifest (injected as blob) ── */
const manifest = {
    name: "MARASSiA",
    short_name: "MARASSiA",
    description: "متجر إلكتروني فاخر — MARASSiA",
    start_url: "./",
    display: "standalone",
    background_color: "#0a1628",
    theme_color: "#0a1628",
    orientation: "portrait-primary",
    lang: "ar",
    dir: "rtl",
    categories: ["shopping", "lifestyle"],
    icons: [
        { src: "data:image/svg+xml," + encodeURIComponent(`
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'>
              <rect width='512' height='512' rx='100' fill='%230a1628'/>
              <text x='256' y='320' font-family='serif' font-size='220' font-weight='bold'
                    fill='%23D4AF37' text-anchor='middle'>M</text>
            </svg>`),
          sizes: "512x512", type: "image/svg+xml", purpose: "any maskable"
        }
    ],
    screenshots: [],
    shortcuts: [
        { name: "المتجر", url: "/store", icons: [{src:"/logo.jpg",sizes:"96x96"}] },
        { name: "الصحة", url: "/medical", icons: [{src:"/logo.jpg",sizes:"96x96"}] }
    ]
};
const manifestBlob = new Blob([JSON.stringify(manifest)], {type:'application/manifest+json'});
const manifestURL  = URL.createObjectURL(manifestBlob);
const mLink = document.createElement('link');
mLink.rel = 'manifest'; mLink.href = manifestURL;
document.head.appendChild(mLink);

/* ── Service Worker (offline cache) ── */
const SW_CODE = `
const CACHE = 'marassia-v1';
const ASSETS = [self.location.href];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
});
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k!==CACHE).map(k => caches.delete(k)))
    ));
    self.clients.claim();
});
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.match(e.request).then(cached => {
            const network = fetch(e.request).then(res => {
                if (res && res.status === 200 && e.request.url.startsWith(self.location.origin)) {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                }
                return res;
            }).catch(() => cached);
            return cached || network;
        })
    );
});
`;
if ('serviceWorker' in navigator) {
    const swBlob = new Blob([SW_CODE], {type:'text/javascript'});
    const swURL  = URL.createObjectURL(swBlob);
    navigator.serviceWorker.register(swURL, {scope: './'})
        .then(reg => {
            console.log('[MARASSiA PWA] Service Worker registered ✓');

        })
        .catch(err => console.warn('[MARASSiA PWA] SW error:', err));
}

})();


function applyFirebaseConfig() {
    const raw = document.getElementById('fb-config-input').value.trim();
    if (!raw) { showToast("الصق الكود الأول!", "error"); return; }
    try {
        // Parse either object literal or JSON
        let cfg;
        try { cfg = JSON.parse(raw); }
        catch { showToast('الكود غير صحيح — الصق JSON فقط', 'error'); return; }
        if (!cfg.apiKey || !cfg.databaseURL) throw new Error("missing keys");
        // Save to localStorage so it loads next time
        localStorage.setItem('marassia_fb_config', JSON.stringify(cfg));
        showToast("تم الحفظ ✓ أعد تحميل الصفحة لتفعيل Firebase!", "info");
        const st = document.getElementById('fb-config-status');
        if (st) {
            st.style.background = '#f0fdf4'; st.style.color = '#166534';
            st.style.borderColor = '#bbf7d0';
            st.innerHTML = '<i class="fas fa-circle" style="font-size:.5rem;margin-left:5px;color:#22c55e;"></i> تم الحفظ — أعد تحميل الصفحة';
        }
    } catch(e) {
        showToast("الكود غير صحيح — تأكد من النسخ من Firebase Console", "error");
    }
}

/* Auto-load Firebase config from localStorage */
(function() {
    const saved = localStorage.getItem('marassia_fb_config');
    if (saved && FIREBASE_CONFIG.apiKey === "YOUR_API_KEY") {
        try {
            const cfg = JSON.parse(saved);
            Object.assign(FIREBASE_CONFIG, cfg);
            // Note: Firebase already initialized above with placeholder
            // Real initialization happens on next page load
        } catch(e) {}
    }
})();



/* ═══════════════════════════════════════════════════
   tObj — Universal translation getter
   Works on products, blogs, hero, settings, anything
   ═══════════════════════════════════════════════════ */
function tObj(obj, field) {
    if (!obj) return '';
    var tr = obj.translations;
    if (tr) {
        if (tr[currentLang] && tr[currentLang][field]) return tr[currentLang][field];
        if (currentLang !== 'ar' && tr['ar'] && tr['ar'][field]) return tr['ar'][field];
    }
    return obj[field] || '';
}

/* ═══════════════════════════════════════════════════
   _autoTranslateObj — One engine for all content
   ═══════════════════════════════════════════════════ */
function _autoTranslateProductAndRefresh(id) {
    var p = db.products.find(function(x){ return x.id === id; });
    if (!p) return;
    var btn = document.getElementById('pd-translate-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ الترجمة...'; }
    _autoTranslateObj(p, ['name','desc'], function(){
        renderProductsGrid(); renderShelves();
        // Refresh detail view
        openProductDetail(id);
    }, p.category ? 'E-commerce product in category: ' + p.category : '');
}

function retranslateBlog(id) {
    var b = db.blogs.find(function(x){ return x.id === id; });
    if (!b) return;
    b.translations = {};
    showToast('⏳ جارٍ ترجمة: ' + b.title, 'info');
    _autoTranslateObj(b, ['title','desc'], function(){ renderBlogs(); updateAdminUI(); });
}

async function translateAllBlogs() {
    var untranslated = db.blogs.filter(function(b){
        return !b.translations || Object.keys(b.translations).length < 7;
    });
    if (!untranslated.length) { showToast('✅ كل المقالات مترجمة!', 'success'); return; }
    var btn = document.getElementById('translate-all-blogs-btn');
    if (btn) btn.disabled = true;
    showToast('⏳ جارٍ ترجمة ' + untranslated.length + ' مقالة...', 'info');
    for (var i = 0; i < untranslated.length; i++) {
        await _autoTranslateObj(untranslated[i], ['title','desc'], null, 'Blog article for MARASSiA e-commerce store');
        await new Promise(function(r){ setTimeout(r, 400); });
    }
    if (btn) btn.disabled = false;
    renderBlogs(); updateAdminUI();
    showToast('🎉 تمت ترجمة ' + untranslated.length + ' مقالة لـ 7 لغات!', 'success');
}


_resetExtraMediaCalled = false;
function editProduct(id) {
    var p = db.products.find(function(x){ return x.id === id; });
    if (!p) return;
    document.getElementById('p-name').value  = p.name  || '';
    document.getElementById('p-price').value = p.price || '';
    document.getElementById('p-desc').value  = p.desc  || '';
    document.getElementById('p-aff').value   = p.aff   || '';
    document.getElementById('p-media').value = p.media || '';
    document.getElementById('p-type').value  = p.type  || 'img';
    var extras = document.getElementById('p-extra-media');
    if (extras) extras.value = (p.images || []).join(String.fromCharCode(10));
    var catSel = document.getElementById('p-cat');
    if (catSel) catSel.value = p.category || '';
    // Mark as editing
    var form = document.querySelector('#admin-prod form');
    if (form) form.dataset.editId = id;
    // Update button
    var btn = form ? form.querySelector('button[type="submit"]') : null;
    if (btn) btn.innerHTML = '<i class="fas fa-save"></i> حفظ التعديل';
    // Scroll to form
    var formEl = document.getElementById('admin-prod');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('✏️ جارٍ تعديل: ' + p.name, 'info');
    var vipEl=document.getElementById('p-vip'); if(vipEl) vipEl.checked=!!p.vip;
    var tEl=document.getElementById('p-trending'); if(tEl) tEl.value=p.trending||0;
    var qEl=document.getElementById('p-quality'); if(qEl&&p.quality) qEl.value=p.quality;
}
function retranslateProduct(id) {
    var p = db.products.find(function(x){ return x.id === id; });
    if (!p) return;
    showToast('⏳ جارٍ إعادة ترجمة: ' + p.name, 'info');
    p.translations = {};
    _autoTranslateProduct(p);
    setTimeout(updateAdminUI, 500);
}

async function translateAllProducts() {
    var untranslated = db.products.filter(function(p) {
        return !p.translations || Object.keys(p.translations).length < 7;
    });
    if (!untranslated.length) { showToast('✅ كل المنتجات مترجمة بالفعل!', 'success'); return; }
    showToast('⏳ جارٍ ترجمة ' + untranslated.length + ' منتج... سيستغرق بعض الوقت', 'info');
    var btn = document.getElementById('translate-all-btn');
    if (btn) btn.disabled = true;
    for (var i = 0; i < untranslated.length; i++) {
        var p = untranslated[i];
        var ctx = p.category ? 'E-commerce product in category: ' + p.category : 'E-commerce product';
        await _autoTranslateObj(p, ['name','desc'], null, ctx);
        await new Promise(function(r){ setTimeout(r, 400); }); // throttle
    }
    if (btn) btn.disabled = false;
    updateAdminUI();
    showToast('🎉 تمت ترجمة ' + untranslated.length + ' منتج لـ 7 لغات!', 'success');
}


/* ═══ Sidebar links admin ═══ */
function toggleLinkTypeFields() {
    var tp = document.getElementById('lnk-type');
    var wr = document.getElementById('lnk-thumb-wrap');
    if (wr) wr.style.display = (tp && tp.value === 'video') ? 'block' : 'none';
}

function saveSidebarLink(e) {
    e.preventDefault();
    if (!db.sidebarLinks) db.sidebarLinks = [];
    var form = document.querySelector('#admin-links form');
    var editId = form && form.dataset.editId ? parseInt(form.dataset.editId) : null;
    var data = {
        label: document.getElementById('lnk-label').value.trim(),
        type:  document.getElementById('lnk-type').value,
        url:   document.getElementById('lnk-url').value.trim(),
        icon:  document.getElementById('lnk-icon').value.trim() || 'fas fa-link',
        thumb: (document.getElementById('lnk-thumb') || {}).value || ''
    };
    if (editId) {
        // Edit existing
        var idx = db.sidebarLinks.findIndex(function(x){ return x.id === editId; });
        if (idx > -1) { data.id = editId; db.sidebarLinks[idx] = data; }
        delete form.dataset.editId;
        var btn = form.querySelector('button[type="submit"]');
        if (btn) btn.innerHTML = '<i class="fas fa-plus"></i> إضافة';
        showToast('✅ تم التعديل بنجاح');
    } else {
        // Add new
        data.id = Date.now();
        db.sidebarLinks.push(data);
        showToast('✅ تمت الإضافة للقائمة');
    }
    form.reset();
    var wr = document.getElementById('lnk-thumb-wrap');
    if (wr) wr.style.display = 'none';
    saveDb(); renderSidebarLinks(); renderSidebarChannel(); refreshLinksAdmin();
}



/* ═══ CHANNEL VIDEOS ADMIN ═══ */


function refreshChannelAdmin() {
    var el = document.getElementById('channel-videos-admin-list');
    if (!el) return;
    var vids = (db.sidebarLinks || []).filter(function(l){ return l.type === 'video'; });
    if (!vids.length) {
        el.innerHTML = '<p style="color:#aaa;font-size:.82rem;text-align:center;padding:10px;">لا توجد فيديوهات بعد</p>';
        return;
    }
    el.innerHTML = vids.map(function(v) {
        var thumb = v.thumb || 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=100';
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #eee;border-radius:11px;margin-bottom:8px;background:#fff8f8;">'
            + '<img src="' + sanitize(thumb) + '" style="width:72px;height:44px;object-fit:cover;border-radius:7px;flex-shrink:0;">'
            + '<div style="flex:1;min-width:0;">'
            + '<div style="font-weight:800;font-size:.84rem;color:var(--dark-blue);">' + sanitize(v.label) + '</div>'
            + '<div style="font-size:.68rem;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + sanitize((v.url||'').replace('https://','')) + '</div>'
            + '</div>'
            + '<div style="display:flex;gap:5px;flex-shrink:0;">'
            + '<button onclick="editChannelVideo(' + v.id + ')" style="background:var(--primary-blue);color:#fff;border:none;border-radius:7px;padding:4px 10px;cursor:pointer;font-size:.73rem;font-weight:800;"><i class="fas fa-edit"></i></button>'
            + '<button onclick="deleteChannelVideo(' + v.id + ')" style="background:#e74c3c;color:#fff;border:none;border-radius:7px;padding:4px 10px;cursor:pointer;font-size:.73rem;font-weight:800;"><i class="fas fa-trash"></i></button>'
            + '</div>'
            + '</div>';
    }).join('');
}


function deleteChannelVideo(id) {
    if (!confirm('حذف هذا الفيديو نهائياً؟')) return;
    db.sidebarLinks = (db.sidebarLinks||[]).filter(function(l){ return l.id !== id; });
    saveDb(); renderSidebarChannel(); refreshChannelAdmin(); refreshLinksAdmin();
    showToast('تم حذف الفيديو', 'info');
}

function editSidebarLink(id) {
    var l = (db.sidebarLinks||[]).find(function(x){ return x.id === id; });
    if (!l) return;
    // Fill the form fields
    document.getElementById('lnk-label').value = l.label || '';
    document.getElementById('lnk-type').value  = l.type  || 'link';
    document.getElementById('lnk-url').value   = l.url   || '';
    document.getElementById('lnk-icon').value  = l.icon  || '';
    var th = document.getElementById('lnk-thumb');
    if (th) th.value = l.thumb || '';
    toggleLinkTypeFields();
    // Set edit mode: store the id we're editing
    var form = document.querySelector('#admin-links form');
    if (form) form.dataset.editId = id;
    // Change submit button text
    var btn = form ? form.querySelector('button[type="submit"]') : null;
    if (btn) btn.innerHTML = '<i class="fas fa-save"></i> حفظ التعديل';
    // Scroll to form
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('عدّل البيانات واضغط حفظ', 'info');
}

function deleteSidebarLink(id) {
    db.sidebarLinks = (db.sidebarLinks || []).filter(function(l) { return l.id !== id; });
    saveDb(); renderSidebarLinks(); renderSidebarChannel(); refreshLinksAdmin();
}

function refreshLinksAdmin() {
    var el = document.getElementById('links-admin-list');
    if (!el) return;
    var links = db.sidebarLinks || [];
    if (!links.length) {
        el.innerHTML = '<p style="color:#aaa;font-size:.82rem;text-align:center;padding:14px;">لا توجد روابط أو فيديوهات بعد</p>';
        return;
    }
    el.innerHTML = links.map(function(l) {
        var isVid = l.type === 'video';
        var badge = isVid
            ? '<span style="background:#e00;color:#fff;border-radius:5px;padding:2px 8px;font-size:.67rem;font-weight:800;">▶ فيديو</span>'
            : '<span style="background:#e8eeff;color:#0033cc;border-radius:5px;padding:2px 8px;font-size:.67rem;font-weight:800;"><i class="fas fa-link"></i> رابط</span>';
        var thumb = isVid && l.thumb
            ? '<img src="' + sanitize(l.thumb) + '" style="width:44px;height:30px;object-fit:cover;border-radius:5px;margin-left:8px;flex-shrink:0;" onerror="this.parentNode.removeChild(this)">'
            : '';
        var urlPreview = l.url
            ? '<div style="font-size:.67rem;color:#aaa;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">' + sanitize(l.url.replace('https://','')) + '</div>'
            : '';
        return '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid #eee;border-radius:11px;margin-bottom:8px;background:#fafafa;">'
            + thumb
            + '<div style="flex:1;min-width:0;">'
            + '<div style="display:flex;align-items:center;gap:6px;">'
            + badge
            + '<span style="font-weight:800;font-size:.84rem;color:var(--dark-blue);">' + sanitize(l.label) + '</span>'
            + '</div>'
            + urlPreview
            + '</div>'
            + '<div style="display:flex;gap:5px;flex-shrink:0;">'
            + '<button onclick="editSidebarLink(' + l.id + ')" '
            + 'style="background:var(--primary-blue);color:#fff;border:none;border-radius:7px;padding:4px 10px;cursor:pointer;font-size:.73rem;font-weight:800;">'
            + '<i class="fas fa-edit"></i></button>'
            + '<button onclick="deleteSidebarLink(' + l.id + ')" '
            + 'style="background:#e74c3c;color:#fff;border:none;border-radius:7px;padding:4px 10px;cursor:pointer;font-size:.73rem;font-weight:800;">'
            + '<i class="fas fa-trash"></i></button>'
            + '</div>'
            + '</div>';
    }).join('');
}


function saveBlog(e) {
    e.preventDefault();
    const fi = document.getElementById('b-file');
    if (fi.files.length > 0) {
        compressImage(fi.files[0], (c) => finalizeSaveBlog(c || ''));
    } else {
        finalizeSaveBlog('https://images.unsplash.com/photo-1512054502232-10a0a035d672?w=800');
    }
}
function finalizeSaveBlog(mediaSrc) {
    // Parse sources
    var sourcesRaw = (document.getElementById('b-sources') || {}).value || '';
    var sources = sourcesRaw.split(String.fromCharCode(10)).map(function(s){ return s.trim(); }).filter(function(s){ return s.length > 3; });

    var cta = (document.getElementById('b-cta') || {}).value || '';
    var ctaUrl = (document.getElementById('b-cta-url') || {}).value || '';

    db.blogs.unshift({
        id:    Date.now(),
        title: document.getElementById('b-title').value.trim(),
        desc:  document.getElementById('b-desc').value.trim(),
        style: document.getElementById('b-style').value,
        media: mediaSrc,
        sources: sources,
        cta: cta,
        ctaUrl: ctaUrl
    });
    document.querySelector('#admin-blog form').reset();
    saveDb(); if(document.getElementById('blog-grid')) renderBlogs(); updateAdminUI();
    showToast(t('blogSaved'));
    _autoTranslateObj(db.blogs[0], ['title','desc'], renderBlogs);
}
function deleteBlog(id) {
    if (!confirm("حذف هذا المقال نهائياً؟")) return;
    db.blogs = db.blogs.filter(b => b.id !== id);
    saveDb(); renderBlogs(); updateAdminUI();
    showToast("تم حذف المقال", "info");
}
function renderSidebarLinks() { if(!document.getElementById('side-custom-links')) return;
    var ul = document.getElementById('side-custom-links');
    if (!ul) return;
    var links = (db.sidebarLinks || []).filter(function(l) { return l.type !== 'video'; });
    if (!links.length) { ul.innerHTML = ''; return; }
    ul.innerHTML = links.map(function(l) {
        var url = l.url ? safeUrl(l.url) : '';
        var href = url || 'javascript:void(0)';
        var extra = url ? ' target="_blank" rel="noopener"' : ' onclick="toggleSidebar()"';
        return '<li><a href="' + href + '"' + extra + '>'
             + '<i class="' + sanitize(l.icon) + '"></i> '
             + '<span>' + sanitize(l.label) + '</span></a></li>';
    }).join('');
}

function renderSidebarChannel() { if(!document.getElementById('side-li-channel')) return;
    var el = document.getElementById('side-channel-wrap');
    if (!el) return;
    var vids = (db.sidebarLinks || []).filter(function(l) { return l.type === 'video'; });
    var liCh = document.getElementById('side-li-channel');
    var ytLink = document.getElementById('ch-yt-link');
    var emptyMsg = document.getElementById('ch-empty-msg');
    // Show YouTube button if yt link is set
    if (ytLink) {
        var yt = db.social && db.social.yt ? safeUrl(db.social.yt) : '';
        if (yt) { ytLink.href = yt; ytLink.style.display = ''; }
        else { ytLink.style.display = 'none'; }
    }
    var items = document.getElementById('side-channel-items');
    if (!vids.length) {
        if (liCh) liCh.style.display = 'none';
        if (emptyMsg) emptyMsg.style.display = 'block';
        if (items) items.innerHTML = '<div class="ch-empty" id="ch-empty-msg"><i class="fas fa-film" style="font-size:1.4rem;color:rgba(255,255,255,.15);display:block;margin-bottom:7px;"></i><span style="font-size:.72rem;color:rgba(255,255,255,.25);">أضف فيديوهات من لوحة التحكم</span></div>';
        return;
    }
    if (liCh) liCh.style.display = '';
    var html = '';
    for (var i = 0; i < Math.min(vids.length, 4); i++) {
        var v = vids[i];
        var thumb = v.thumb || 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=300';
        var url = safeUrl(v.url || '');
        html += '<div class="ch-card" data-url="' + url + '" onclick="openChannelVideo(this.dataset.url)">'
             + '<div class="ch-thumb" style="background-image:url(' + sanitize(thumb) + ')">'
             + '<div class="ch-play">&#9654;</div></div>'
             + '<div class="ch-title">' + sanitize(v.label || '') + '</div></div>';
    }
    if (items) items.innerHTML = html;
}
function openChannelModal() {
    var vids = (db.sidebarLinks || []).filter(function(l){ return l.type === 'video'; });
    var modal = document.getElementById('channel-player-modal');
    var grid  = document.getElementById('ch-modal-grid');
    var empty = document.getElementById('ch-modal-empty');
    var count = document.getElementById('ch-modal-count');
    var ytBtn = document.getElementById('ch-modal-yt-btn');
    if (!modal) return;
    // YouTube link
    var yt = db.social && db.social.yt ? safeUrl(db.social.yt) : '';
    if (ytBtn) { if (yt) { ytBtn.href = yt; ytBtn.style.display = ''; } else { ytBtn.style.display = 'none'; } }
    if (count) count.textContent = vids.length ? vids.length + ' فيديو' : 'لا توجد فيديوهات';
    // Render grid
    if (!vids.length) {
        if (grid)  grid.style.display  = 'none';
        if (empty) empty.style.display = 'block';
    } else {
        if (empty) empty.style.display = 'none';
        if (grid)  grid.style.display  = '';
        grid.innerHTML = vids.map(function(v){
            var thumb = v.thumb || 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=300';
            var url   = safeUrl(v.url || '');
            return '<div data-url="' + url + '" onclick="openChannelVideo(this.dataset.url)" style="cursor:pointer;border-radius:11px;overflow:hidden;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.07);transition:.2s;" onmouseover="this.style.borderColor=\'rgba(212,175,55,.4)\'" onmouseout="this.style.borderColor=\'rgba(255,255,255,.07)\'">';
                 + '<div style="position:relative;padding-top:56%;background:url(' + sanitize(thumb) + ') center/cover;">'
                 + '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.3);">'
                 + '<div style="width:38px;height:38px;background:rgba(220,0,0,.85);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:.95rem;">&#9654;</div>'
                 + '</div></div>'
                 + '<div style="padding:8px 10px;"><div style="font-size:.76rem;font-weight:800;color:rgba(255,255,255,.85);line-height:1.3;">' + sanitize(v.label||'') + '</div></div></div>';
        }).join('');
    }
    modal.classList.add('active');
}

function openChannelVideo(url) {
    if (!url) return;
    var embed = url.replace('watch?v=','embed/').replace('youtu.be/','www.youtube.com/embed/');
    embed += (embed.indexOf('?') > -1 ? '&' : '?') + 'autoplay=1';
    var frame = document.getElementById('channel-frame');
    var wrap  = document.getElementById('ch-frame-wrap');
    if (!frame || !wrap) { window.open(url,'_blank'); return; }
    frame.src = embed;
    wrap.style.display = 'block';
    var grid  = document.getElementById('ch-modal-grid');
    if (grid) grid.style.display = 'none';
}

function closeChannelModal() {
    var frame = document.getElementById('channel-frame');
    var modal = document.getElementById('channel-player-modal');
    var wrap  = document.getElementById('ch-frame-wrap');
    if (frame) frame.src = '';
    if (wrap)  wrap.style.display = 'none';
    if (modal) modal.classList.remove('active');
    // Restore grid
    var grid = document.getElementById('ch-modal-grid');
    if (grid) grid.style.display = '';
}


/* ═══ PRODUCT REVIEWS ═══ */
function getReviews(productId) {
    if (!db.reviews) db.reviews = {};
    return db.reviews[productId] || [];
}

function submitReview(productId) {
    if (!currentUser) { showToast('سجّل دخولك أولاً لإضافة تقييم', 'error'); return; }
    var rating = parseInt(document.getElementById('rev-rating-val').value || '5');
    var text   = (document.getElementById('rev-text').value || '').trim().slice(0, 300);
    if (!text) { showToast('اكتب تقييمك أولاً', 'error'); return; }
    if (!db.reviews) db.reviews = {};
    if (!db.reviews[productId]) db.reviews[productId] = [];
    // Check duplicate
    if (db.reviews[productId].some(function(r){ return r.user === currentUser; })) {
        showToast('قيّمت هذا المنتج من قبل', 'info'); return;
    }
    db.reviews[productId].unshift({
        id: Date.now(), user: sanitize(currentUser),
        rating: Math.min(5, Math.max(1, rating)),
        text: sanitize(text),
        date: new Date().toLocaleDateString('ar-EG')
    });
    saveDb();
    document.getElementById('rev-text').value = '';
    renderReviews(productId);
    showToast('✅ شكراً على تقييمك!', 'success');
}

function renderReviews(productId) {
    var el = document.getElementById('pd-reviews-list');
    if (!el) return;
    var revs = getReviews(productId);
    var avg  = revs.length ? (revs.reduce(function(s,r){ return s+r.rating; },0)/revs.length).toFixed(1) : null;
    var avgEl = document.getElementById('pd-avg-rating');
    if (avgEl) avgEl.innerHTML = avg
        ? '<span style="color:#D4AF37;font-size:1.1rem;">★</span> ' + avg + ' <span style="color:#888;font-size:.82rem;">(' + revs.length + ' تقييم)</span>'
        : '<span style="color:#aaa;font-size:.85rem;">لا توجد تقييمات بعد</span>';
    if (!revs.length) {
        el.innerHTML = '<p style="color:#aaa;font-size:.85rem;text-align:center;padding:16px 0;">كن أول من يقيّم هذا المنتج!</p>';
        return;
    }
    el.innerHTML = revs.map(function(r){
        var stars = '';
        for(var i=1;i<=5;i++) stars += '<span style="color:' + (i<=r.rating?'#D4AF37':'#ddd') + ';font-size:.95rem;">★</span>';
        return '<div class="review-item">'
            + '<div class="review-header"><span class="review-user">' + r.user + '</span>'
            + '<span class="review-stars">' + stars + '</span>'
            + '<span class="review-date">' + r.date + '</span></div>'
            + '<p class="review-text">' + r.text + '</p>'
            + '</div>';
    }).join('');
}

function setReviewStar(n) {
    document.getElementById('rev-rating-val').value = n;
    document.querySelectorAll('.rev-star').forEach(function(s,i){
        s.style.color = i < n ? '#D4AF37' : '#ddd';
    });
}

function renderReviewsAdmin() {
    var el = document.getElementById('revs-admin-content');
    if (!el) return;
    if (!db.reviews || !Object.keys(db.reviews).length) {
        el.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px;">لا توجد تقييمات بعد</p>';
        return;
    }
    var html = '';
    Object.keys(db.reviews).forEach(function(pid){
        var prod = db.products.find(function(p){ return p.id == pid; });
        var revs = db.reviews[pid] || [];
        if (!revs.length) return;
        var avg = (revs.reduce(function(s,r){return s+r.rating;},0)/revs.length).toFixed(1);
        html += '<div style="border:1px solid #eee;border-radius:12px;padding:14px;margin-bottom:14px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
        html += '<strong>' + (prod ? sanitize(prod.name) : 'منتج #'+pid) + '</strong>';
        html += '<span style="color:#D4AF37;font-weight:800;">★ ' + avg + ' (' + revs.length + ')</span></div>';
        revs.forEach(function(r){
            var stars = '';
            for(var i=1;i<=5;i++) stars += '<span style="color:'+(i<=r.rating?'#D4AF37':'#ddd')+'">★</span>';
            html += '<div style="padding:8px 0;border-top:1px solid #f5f5f5;display:flex;justify-content:space-between;align-items:center;">';
            html += '<div><span style="font-weight:800;font-size:.82rem;color:#333;">' + r.user + '</span> ' + stars + '<p style="font-size:.8rem;color:#666;margin:2px 0 0;">' + r.text + '</p></div>';
            html += '<button onclick="deleteReview(' + pid + ',' + r.id + ')" style="background:#e74c3c;color:#fff;border:none;border-radius:7px;padding:3px 9px;cursor:pointer;font-size:.72rem;white-space:nowrap;">حذف</button>';
            html += '</div>';
        });
        html += '</div>';
    });
    el.innerHTML = html || '<p style="color:#aaa;text-align:center;padding:20px;">لا توجد تقييمات بعد</p>';
}

function deleteReview(pid, rid) {
    if (!db.reviews || !db.reviews[pid]) return;
    db.reviews[pid] = db.reviews[pid].filter(function(r){ return r.id !== rid; });
    if (!db.reviews[pid].length) delete db.reviews[pid];
    saveDb();
    renderReviewsAdmin();
    showToast('تم حذف التقييم', 'info');
}


/* ═══════════════════════════════════════════════════════════
   MARASSiA AI ENGINE
   - Detects user language automatically
   - Responds in same language
   - 6 intelligent modes
   - Product recommendations with mini-cards
   - NO Hebrew responses
   ═══════════════════════════════════════════════════════════ */

var _aiHistory = [];
var _aiMode    = 'recommend';
var _aiBusy    = false;

/* Auto-resize textarea */
(function(){
    var el = document.getElementById('ai-input');
    if (!el) return;
    el.addEventListener('input', function(){
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
})();

function aiSetMode(mode, el, label, sub) {
    _aiMode = mode;
    document.querySelectorAll('.ai-mode-btn').forEach(function(b){ b.classList.remove('on'); });
    el.classList.add('on');
    var lbl = document.getElementById('ai-mode-label');
    var sub2 = document.getElementById('ai-hero-sub');
    if (lbl) lbl.textContent = label;
    if (sub2) sub2.textContent = sub;
}

function aiChip(el) {
    document.getElementById('ai-input').value = el.textContent.trim();
    var chips = document.getElementById('ai-chips');
    if (chips) { chips.style.opacity = '0'; setTimeout(function(){ chips.style.display = 'none'; }, 250); }
    aiSend();
}

function aiClear() {
    _aiHistory = [];
    document.getElementById('ai-msgs').innerHTML = '';
    var chips = document.getElementById('ai-chips');
    if (chips) { chips.style.display = ''; chips.style.opacity = '1'; }
    _aiGreet();
}

function _aiAddMsg(role, html) {
    var wrap = document.getElementById('ai-msgs');
    if (!wrap) return;
    var d = document.createElement('div');
    d.className = 'ai-msg ' + (role === 'user' ? 'u' : 'a');
    d.innerHTML = '<div class="ai-av">' + (role === 'user' ? '👤' : 'AI') + '</div>'
                + '<div class="ai-bbl">' + html + '</div>';
    wrap.appendChild(d);
    wrap.scrollTop = wrap.scrollHeight;
}

function _aiShowTyping() {
    var wrap = document.getElementById('ai-msgs');
    if (!wrap) return;
    var d = document.createElement('div');
    d.className = 'ai-msg a'; d.id = 'ai-typing';
    d.innerHTML = '<div class="ai-av">AI</div>'
                + '<div class="ai-bbl"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span></div>';
    wrap.appendChild(d);
    wrap.scrollTop = wrap.scrollHeight;
}

function _aiHideTyping() {
    var t = document.getElementById('ai-typing');
    if (t) t.remove();
}

function _aiProdCards(prods) {
    if (!prods || !prods.length) return '';
    var html = '<div class="ai-rec-grid">';
    prods.slice(0, 6).forEach(function(p) {
        var img = p.media || 'https://images.unsplash.com/photo-1553949333-f3e26e73ce76?w=300';
        html += '<a class="ai-rec-card" href="javascript:void(0)" onclick="navigateToProduct(' + p.id + ');navigate(\'home\')">'
              + '<img class="ai-rec-img" src="' + sanitize(img) + '" alt="' + sanitize(tObj(p,'name')) + '" onerror="this.style.display=\'none\'">'
              + '<div class="ai-rec-body">'
              + '<div class="ai-rec-name">' + sanitize(tObj(p,'name')) + '</div>'
              + '<div class="ai-rec-price">' + Number(p.price||0).toLocaleString() + ' ' + t('currency') + '</div>'
              + '</div></a>';
    });
    return html + '</div>';
}

function _aiFormat(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^#{1,3}\s(.+)$/gm, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

async function aiSend() {
    if (_aiBusy) return;
    var inp = document.getElementById('ai-input');
    var text = (inp ? inp.value : '').trim();
    if (!text) return;
    inp.value = ''; if (inp) inp.style.height = 'auto';
    document.getElementById('ai-send-btn').disabled = true;
    _aiBusy = true;

    _aiAddMsg('user', text);
    _aiHistory.push({ role: 'user', content: text });
    _aiShowTyping();

    /* Build product catalog */
    var catalog = '';
    if (db.products && db.products.length) {
        catalog = 'STORE CATALOG:\n' + db.products.slice(0, 50).map(function(p) {
            return '- [ID:' + p.id + '] ' + p.name + ' | Category:' + p.category + ' | Price:' + p.price + ' EGP' + (p.salesCount > 0 ? ' | POPULAR' : '');
        }).join('\n');
    } else {
        catalog = 'No products available yet.';
    }

    /* Mode instructions */
    var modeInstr = {
        recommend: 'Give 2-4 targeted product recommendations with brief explanations. Be specific about WHY each product suits the user.',
        compare:   'Build a clear comparison. Use a simple HTML table (<table>) with columns for the product attributes being compared.',
        gift:      'Think about the occasion, recipient personality, and budget. Suggest 2-3 options with gift-wrapping tips.',
        budget:    'Prioritize value-for-money. Group suggestions by price range.',
        style:     'Match products to lifestyle and personality. Be aspirational and vivid in descriptions.',
        free:      'Answer freely and naturally. You can discuss anything beyond just products.'
    };

    /* System prompt */
    var sys = 'You are MARASSiA AI — a world-class smart shopping advisor for MARASSiA luxury store. Brand motto: "MAKE A REAL AND STRONG SENSE".\n\n'
        + 'CRITICAL LANGUAGE RULE: Detect the language the user writes in and ALWAYS respond in that EXACT language. '
        + 'If user writes Arabic → respond in Arabic. English → English. French → French. Spanish → Spanish. '
        + 'Chinese → Chinese. German → German. Italian → Italian. And so on for ALL world languages. '
        + 'EXCEPTION: If user writes in Hebrew, politely respond in English that this language is not supported.\n\n'
        + 'CURRENT MODE: ' + _aiMode + '\nINSTRUCTION: ' + (modeInstr[_aiMode] || modeInstr.free) + '\n\n'
        + 'WHEN RECOMMENDING PRODUCTS: Add at the END of your response exactly: [REC:id1,id2,id3]\n'
        + 'Only use IDs from the catalog below. Never invent products.\n'
        + 'Use **bold** for emphasis. Keep responses concise and impactful.\n\n'
        + catalog;

    try {
        var res = await _apiFetch({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 800,
                system: sys,
                messages: _aiHistory.slice(-12)
            });
        var data = await res.json();
        var blk = (data.content || []).find(function(b) { return b.type === 'text'; });
        var reply = blk ? blk.text : '';
        if (!reply) { var apiErr = data.error ? data.error.message||data.error.type : 'empty'; throw new Error('API: '+apiErr); }

        /* Extract product IDs */
        var cards = '';
        var match = reply.match(/\[REC:([\d,]+)\]/);
        if (match) {
            var ids = match[1].split(',').map(Number);
            var prods = ids.map(function(id) {
                return db.products.find(function(p) { return p.id === id; });
            }).filter(Boolean);
            cards = _aiProdCards(prods);
            reply = reply.replace(/\[REC:[\d,]+\]/g, '').trim();
        }

        _aiHideTyping();
        _aiAddMsg('ai', _aiFormat(reply) + cards);
        _aiHistory.push({ role: 'assistant', content: reply });

    } catch(e) {
        _aiHideTyping();
        _aiAddMsg('ai', _aiMaintenanceMsg());
    }

    _aiBusy = false;
    var sb = document.getElementById('ai-send-btn');
    if (sb) sb.disabled = false;
}

function _aiGreet() {
    var count = db.products ? db.products.length : 0;
    setTimeout(function() {
        _aiAddMsg('ai',
            '<strong>مرحباً! أنا MARASSiA AI ✦</strong><br>'
            + (count ? 'لدي <strong>' + count + '</strong> منتج في المتجر.' : 'المتجر في طور الإعداد.')
            + '<br>اسألني بأي لغة تريد — سأفهمك وأرد عليك بنفس لغتك. 🌍'
        );
    }, 300);
}


/* ═══ SIDEBAR ITEMS ADMIN ═══ */

// Default sidebar items config stored in db.settings.sidebarItems
var DEFAULT_SIDEBAR_ITEMS = [
    { id:'login',   icon:'fas fa-user-circle', label:'تسجيل الدخول',    visible:true,  fixed:true  },
    { id:'home',    icon:'fas fa-store',        label:'متجرنا',           visible:true,  fixed:false },
    { id:'channel', icon:'fas fa-play-circle',  label:'قناتنا',           visible:true,  fixed:false, iconColor:'#e00' },
    { id:'blog',    icon:'fas fa-newspaper',    label:'مدونتنا',          visible:true,  fixed:false },
    { id:'ai',      icon:'fas fa-robot',        label:'ذكاؤنا الاصطناعي', visible:true,  fixed:false, iconColor:'#7c3aed', badge:'AI', badgeColor:'#7c3aed' },
    { id:'about',   icon:'fas fa-info-circle',  label:'من نحن',           visible:true,  fixed:false },
];

function getSidebarItems() {
    if (!db.settings.sidebarItems || !db.settings.sidebarItems.length) {
        db.settings.sidebarItems = JSON.parse(JSON.stringify(DEFAULT_SIDEBAR_ITEMS));
    }
    return db.settings.sidebarItems;
}

function renderSidebarFromAdmin() {
    var items = getSidebarItems();
    var ul = document.querySelector('.side-menu');
    if (!ul) return;
    // Only update the fixed items visibility/label (custom items handled separately)
    items.forEach(function(item) {
        var li;
        if (item.id === 'login')   li = document.getElementById('side-li-login');
        else if (item.id === 'channel') li = document.getElementById('side-li-channel');
        else {
            // Find by onclick content
            var lis = ul.querySelectorAll('li');
            for (var i=0;i<lis.length;i++) {
                var a = lis[i].querySelector('a');
                if (a && a.getAttribute('onclick') && a.getAttribute('onclick').indexOf("'"+item.id+"'") > -1) {
                    li = lis[i]; break;
                }
            }
        }
        if (li) {
            li.style.display = item.visible ? '' : 'none';
            var span = li.querySelector('span:not(.side-badge)');
            if (span) span.textContent = item.label;
            var icon = li.querySelector('i');
            if (icon) { icon.className = item.icon; if (item.iconColor) icon.style.color = item.iconColor; }
        }
    });
}

function refreshSidebarItemsAdmin() {
    var el = document.getElementById('sidebar-items-admin');
    if (!el) return;
    var items = getSidebarItems();
    el.innerHTML = items.map(function(item, i) {
        var badge = item.badge ? '<span style="background:' + (item.badgeColor||'var(--gold)') + ';color:#fff;border-radius:4px;padding:1px 7px;font-size:.65rem;font-weight:900;margin-right:6px;">' + item.badge + '</span>' : '';
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #eee;border-radius:10px;margin-bottom:8px;background:var(--white);">'
            + '<i class="' + item.icon + '" style="width:20px;text-align:center;color:' + (item.iconColor||'var(--primary-blue)') + ';"></i>'
            + '<span style="flex:1;font-weight:800;font-size:.85rem;color:var(--dark-blue);">' + item.label + badge + '</span>'
            + (item.fixed ? '<span style="font-size:.7rem;color:#aaa;">ثابت</span>' : '')
            + (!item.fixed ? '<button onclick="sidebarItemToggle(' + i + ')" style="background:' + (item.visible?'#22c55e':'#e74c3c') + ';color:#fff;border:none;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:.72rem;font-weight:800;">' + (item.visible?'ظاهر':'مخفي') + '</button>' : '')
            + (!item.fixed && i > 0 ? '<button onclick="sidebarItemMove(' + i + ',-1)" style="background:#eee;border:none;border-radius:6px;padding:3px 9px;cursor:pointer;">▲</button>' : '')
            + (!item.fixed && i < items.length-1 ? '<button onclick="sidebarItemMove(' + i + ',1)" style="background:#eee;border:none;border-radius:6px;padding:3px 9px;cursor:pointer;">▼</button>' : '')
            + '<button onclick="sidebarItemEdit(' + i + ')" style="background:var(--primary-blue);color:#fff;border:none;border-radius:6px;padding:3px 9px;cursor:pointer;font-size:.72rem;"><i class="fas fa-edit"></i></button>'
            + '</div>';
    }).join('');
}

function sidebarItemToggle(idx) {
    var items = getSidebarItems();
    if (items[idx] && !items[idx].fixed) items[idx].visible = !items[idx].visible;
    saveDb(); renderSidebarFromAdmin(); refreshSidebarItemsAdmin();
}

function sidebarItemMove(idx, dir) {
    var items = getSidebarItems();
    var newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= items.length) return;
    var tmp = items[idx]; items[idx] = items[newIdx]; items[newIdx] = tmp;
    saveDb(); refreshSidebarItemsAdmin();
    showToast('تم تغيير الترتيب');
}

function sidebarItemEdit(idx) {
    var items = getSidebarItems();
    var item = items[idx];
    if (!item) return;
    var newLabel = prompt('الاسم الجديد:', item.label);
    if (newLabel === null) return;
    if (newLabel.trim()) item.label = newLabel.trim();
    var newIcon = prompt('الأيقونة (Font Awesome):', item.icon);
    if (newIcon !== null && newIcon.trim()) item.icon = newIcon.trim();
    saveDb(); renderSidebarFromAdmin(); refreshSidebarItemsAdmin();
    showToast('✅ تم تعديل العنصر');
}

/* ═══ INTRO SCREEN ADMIN ═══ */
function updateIntroAdminUI() {
    var intro = db.settings.intro || {};
    var el = document.getElementById('intro-enabled');
    if (el) el.value = intro.enabled ? '1' : '0';
    var dur = document.getElementById('intro-duration');
    if (dur) dur.value = intro.duration || 3;
    var txt = document.getElementById('intro-text');
    if (txt) txt.value = intro.text || '';
    var sub = document.getElementById('intro-subtext');
    if (sub) sub.value = intro.subtext || '';
    var col = document.getElementById('intro-color');
    if (col) col.value = intro.color || '#001a66';
    var sty = document.getElementById('intro-style');
    if (sty) sty.value = intro.style || 'minimal';
    introPreview();
}

function introPreview() {
    var prev = document.getElementById('intro-preview');
    if (!prev) return;
    var enabled = document.getElementById('intro-enabled').value === '1';
    if (!enabled) { prev.style.display = 'none'; return; }
    var color  = document.getElementById('intro-color').value || '#001a66';
    var text   = document.getElementById('intro-text').value || 'MARASSiA';
    var subtext= document.getElementById('intro-subtext').value || '';
    var style  = document.getElementById('intro-style').value || 'minimal';
    prev.style.display = 'block';
    prev.style.background = color;
    var animClass = style === 'pulse' ? 'animation:introTextPulse 1.5s ease infinite;' : style === 'slide' ? 'animation:introTextSlide .8s ease;' : '';
    prev.innerHTML = '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">'
        + '<div style="font-size:1.8rem;font-weight:900;color:#fff;letter-spacing:.18em;' + animClass + '">' + sanitize(text) + '</div>'
        + (subtext ? '<div style="font-size:.72rem;color:rgba(255,255,255,.55);letter-spacing:.22em;text-transform:uppercase;">' + sanitize(subtext) + '</div>' : '')
        + '<div style="width:40px;height:3px;background:var(--gold);border-radius:2px;margin-top:8px;"></div>'
        + '</div>';
}

function saveIntroSettings() {
    if (!db.settings) db.settings = {};
    db.settings.intro = {
        enabled:  document.getElementById('intro-enabled').value === '1',
        duration: parseInt(document.getElementById('intro-duration').value)||3,
        text:     document.getElementById('intro-text').value.trim(),
        subtext:  document.getElementById('intro-subtext').value.trim(),
        color:    document.getElementById('intro-color').value || '#001a66',
        style:    document.getElementById('intro-style').value || 'minimal'
    };
    saveDb();
    showToast(db.settings.intro.enabled ? '✅ الانترو مفعّل' : '✅ الانترو معطّل', 'success');
    // Apply immediately if enabled
    applyIntroOnLoad();
}

function previewIntroFull() {
    var color  = document.getElementById('intro-color').value || '#001a66';
    var text   = document.getElementById('intro-text').value || 'MARASSiA';
    var subtext= document.getElementById('intro-subtext').value || 'MAKE A REAL AND STRONG SENSE';
    var duration = parseInt(document.getElementById('intro-duration').value)||3;
    showIntroScreen(color, text, subtext, duration);
}

function applyIntroOnLoad() {
    // Called at boot — shows intro if enabled
    var intro = db.settings && db.settings.intro;
    if (!intro || !intro.enabled) return;
    var dur = (intro.duration || 3) * 1000;
    showIntroScreen(intro.color||'#001a66', intro.text||'MARASSiA', intro.subtext||'', dur);
}

function showIntroScreen(bg, text, subtext, duration) {
    // Don't show if already showing
    if (document.getElementById('dynamic-intro')) return;
    var div = document.createElement('div');
    div.id = 'dynamic-intro';
    div.style.cssText = 'position:fixed;inset:0;z-index:99998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:' + bg + ';transition:opacity 1s ease,visibility 1s ease;';
    div.innerHTML = ''
        + '<div style="font-size:clamp(2rem,8vw,3.5rem);font-weight:900;color:#fff;letter-spacing:.2em;animation:iTextIn .7s ease;">' + sanitize(text) + '</div>'
        + (subtext ? '<div style="font-size:.7rem;color:rgba(255,255,255,.45);letter-spacing:.3em;text-transform:uppercase;animation:iTextIn .9s ease;">' + sanitize(subtext) + '</div>' : '')
        + '<div style="width:44px;height:44px;border:3px solid rgba(255,255,255,.15);border-top-color:var(--gold);border-radius:50%;animation:iSpin 1s linear infinite;margin-top:20px;"></div>';
    document.body.insertBefore(div, document.body.firstChild);
    setTimeout(function(){
        div.style.opacity = '0'; div.style.visibility = 'hidden';
        setTimeout(function(){ if(div.parentNode) div.remove(); }, 1000);
    }, duration);
}


/* ═══ DYNAMIC SEO ENGINE ═══ */
function updatePageSEO(viewId, extra) {
    var titles = {
        home:    'MARASSiA — متجر فاخر | تسوق ذكي',
        blog:    'مدونة MARASSiA — مقالات ونصائح',
        about:   'من نحن | MARASSiA',
        ai:      'MARASSiA AI — مستشارك الذكي للتسوق',
        article: extra ? 'MARASSiA — ' + extra : 'MARASSiA Blog',
        category: extra ? 'MARASSiA — ' + extra : 'MARASSiA',
    };
    var descs = {
        home:    'تسوق ذكي وفاخر مع MARASSiA. منتجات مختارة، ترجمة 7 لغات، ذكاء اصطناعي.',
        blog:    'اقرأ أحدث المقالات والنصائح من MARASSiA.',
        about:   'تعرف على قصة MARASSiA ورؤيتنا لمستقبل التسوق.',
        ai:      'استخدم ذكاء MARASSiA الاصطناعي للحصول على توصيات تسوق مخصصة.',
    };
    document.title = titles[viewId] || 'MARASSiA';
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = descs[viewId] || descs.home;
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = document.title;
}

function injectProductSchema(products) {
    var existing = document.getElementById('products-schema');
    if (existing) existing.remove();
    if (!products || !products.length) return;
    var items = products.slice(0,20).map(function(p, i) {
        return {
            "@type": "ListItem",
            "position": i + 1,
            "item": {
                "@type": "Product",
                "name": p.name,
                "description": p.desc || '',
                "offers": {
                    "@type": "Offer",
                    "price": p.price || 0,
                    "priceCurrency": "EGP",
                    "availability": "https://schema.org/InStock",
                    "url": "https://marassia.netlify.app/"
                }
            }
        };
    });
    var schema = document.createElement('script');
    schema.id = 'products-schema';
    schema.type = 'application/ld+json';
    schema.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "منتجات MARASSiA",
        "itemListElement": items
    });
    document.head.appendChild(schema);
}

function updateSitemapPing() {
    // Ping Google with sitemap after first load (once per session)
    if (sessionStorage.getItem('pinged')) return;
    sessionStorage.setItem('pinged', '1');
    // Create sitemap dynamically
    var sitemap = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + '<url><loc>https://marassia.netlify.app/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>'
        + '</urlset>';
    // Can't write file but we inject meta for crawlers
}


/* ═══════════════════════════════════════════════════════
   SMART TRANSLATION ENGINE — Google Translate Free API
   Fallback chain: Google → MyMemory → original text
   ═══════════════════════════════════════════════════════ */

var _trCache = {};  // Cache to avoid duplicate calls

async function _smartTranslate(text, targetLang, sourceLang) {
    sourceLang = sourceLang || 'ar';
    if (!text || !text.trim()) return text;
    if (targetLang === sourceLang) return text;

    var cacheKey = sourceLang + ':' + targetLang + ':' + text.slice(0,50);
    if (_trCache[cacheKey]) return _trCache[cacheKey];

    // Method 1: Google Translate (unofficial free endpoint)
    try {
        var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl='
            + sourceLang + '&tl=' + targetLang + '&dt=t&q=' + encodeURIComponent(text);
        var res = await fetch(url);
        var data = await res.json();
        var result = '';
        if (data && data[0]) {
            data[0].forEach(function(part) { if (part && part[0]) result += part[0]; });
        }
        if (result) {
            _trCache[cacheKey] = result;
            return result;
        }
    } catch(e) { /* fall through */ }

    // Method 2: MyMemory free API (500 words/day free)
    try {
        var url2 = 'https://api.mymemory.translated.net/get?q='
            + encodeURIComponent(text) + '&langpair=' + sourceLang + '|' + targetLang;
        var res2 = await fetch(url2);
        var data2 = await res2.json();
        if (data2.responseStatus === 200 && data2.responseData.translatedText) {
            var r2 = data2.responseData.translatedText;
            _trCache[cacheKey] = r2;
            return r2;
        }
    } catch(e) { /* fall through */ }

    // Fallback: return original
    return text;
}

async function _autoTranslateObjGoogle(obj, fields, onDone, context) {
    if (!obj || !fields.length) return;
    var langs = ['ar','en','fr','es','it','de','zh'];
    var langCodes = {ar:'ar',en:'en',fr:'fr',es:'es',it:'it',de:'de',zh:'zh-CN'};
    var sourceText = {};
    fields.forEach(function(f){ if(obj[f]) sourceText[f] = obj[f]; });
    if (!Object.keys(sourceText).length) return;

    // Detect source language (assume Arabic if contains Arabic chars)
    var hasArabic = /[\u0600-\u06FF]/.test(Object.values(sourceText).join(' '));
    var srcLang = hasArabic ? 'ar' : 'en';

    var translations = {};
    var total = langs.length * fields.length;
    var done = 0;

    showToast('⏳ جارٍ الترجمة التلقائية...', 'info');

    for (var i = 0; i < langs.length; i++) {
        var lang = langs[i];
        translations[lang] = {};
        for (var j = 0; j < fields.length; j++) {
            var field = fields[j];
            var text = sourceText[field] || '';
            try {
                var tgtCode = langCodes[lang] || lang;
                var translated = await _smartTranslate(text, tgtCode, srcLang);
                translations[lang][field] = translated;
            } catch(e) {
                translations[lang][field] = text;
            }
            done++;
        }
        // Small delay to avoid rate limiting
        await new Promise(function(r){ setTimeout(r, 120); });
    }

    obj.translations = translations;
    saveDb();
    if (onDone) onDone();
    showToast('✅ ترجمة لـ 7 لغات 🌍', 'success');
}

/* Override _autoTranslateObj to use Google Translate */
async function _autoTranslateObj(obj, fields, onDone, context) {
    return _autoTranslateObjGoogle(obj, fields, onDone, context);
}

/* Save before page close/refresh */
window.addEventListener('beforeunload', function() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch(e) {}
});


/* ═══ CURRENCY SYSTEM ═══ */
const COUNTRY_CURRENCY = {
    US:'USD',CA:'USD',AU:'AUD',GB:'GBP',
    EG:'EGP',SA:'SAR',AE:'AED',KW:'KWD',QA:'QAR',BH:'BHD',OM:'OMR',JO:'JOD',LB:'LBP',
    MA:'MAD',TN:'TND',DZ:'DZD',LY:'LYD',
    TR:'TRY',IR:'IRR',PK:'PKR',IN:'INR',
    CN:'CNY',JP:'JPY',KR:'KRW',
    DE:'EUR',FR:'EUR',IT:'EUR',ES:'EUR',NL:'EUR',BE:'EUR',PT:'EUR',AT:'EUR',GR:'EUR',
    BR:'BRL',MX:'MXN',AR:'ARS',
    RU:'RUB',UA:'UAH',PL:'PLN',
    OTHER:'USD'
};
const CURRENCY_SYMBOLS = {
    USD:'$',EUR:'€',GBP:'£',SAR:'ر.س',AED:'د.إ',KWD:'د.ك',EGP:'ج.م',
    QAR:'ر.ق',BHD:'د.ب',OMR:'ر.ع',JOD:'د.أ',MAD:'د.م',TND:'د.ت',
    CNY:'¥',JPY:'¥',KRW:'₩',INR:'₹',TRY:'₺',BRL:'R$',RUB:'₽',
    IRR:'﷼',PKR:'₨',MXN:'$',ARS:'$',AUD:'A$',CAD:'$',CHF:'Fr'
};
/* Rates vs USD (USD = base 1.0) */
const CURRENCY_RATES = {
    USD:1, EUR:0.92, GBP:0.79, CAD:1.36, AUD:1.53,
    EGP:49.5, SAR:3.75, AED:3.67, KWD:0.31, QAR:3.64, BHD:0.38, OMR:0.385, JOD:0.71,
    MAD:10.0, TND:3.11, DZD:134, LYD:4.8,
    CNY:7.24, JPY:149, KRW:1330, INR:83, TRY:32,
    KWD:0.006, QAR:0.073, BHD:0.0075, OMR:0.0077, JOD:0.014,
    MAD:0.20, TND:0.062, DZD:2.7, LYD:0.097,
    CNY:0.146, JPY:3.01, KRW:27.5, INR:1.67, TRY:0.65,
    GBP:0.016, AUD:0.031, BRL:0.11, RUB:1.82, PKR:5.6,
    MXN:0.39, ARS:19.8
};

var _userCurrency = 'USD';

function initCurrency() {
    // Try to get from user profile
    if (_userProfile && _userProfile.country) {
        _userCurrency = COUNTRY_CURRENCY[_userProfile.country] || 'USD';
    } else {
        // Try browser locale
        try {
            var locale = navigator.language || navigator.userLanguage || '';
            var regionMatch = locale.match(/-([A-Z]{2})$/);
            if (regionMatch) {
                _userCurrency = COUNTRY_CURRENCY[regionMatch[1]] || 'USD';
            }
        } catch(e) {}
    }
}

function formatPrice(usdPrice) {
    var num = parseFloat(usdPrice) || 0;
    var rate = CURRENCY_RATES[_userCurrency] || 1;
    var converted = num * rate;
    var symbol = CURRENCY_SYMBOLS[_userCurrency] || _userCurrency;
    if (converted >= 10000)    return symbol + Math.round(converted).toLocaleString();
    else if (converted >= 100) return symbol + converted.toLocaleString(undefined,{maximumFractionDigits:0});
    else if (converted >= 1)   return symbol + converted.toFixed(2);
    else                       return symbol + converted.toFixed(4);
}


/* ═══ BEST SELLER + FILTERING ═══ */
var _filterState = { sort: '', month: '', year: '' };

function renderBestSellers() { if(!document.getElementById('bestsellers-shelf') && !document.getElementById('bestsellers-grid')) return;
    var el = document.getElementById('bestsellers-section');
    if (!el) return;
    el.removeAttribute('data-bs-rendered');  // allow re-render
    var topProds = db.products
        .filter(function(p){ return p.salesCount && p.salesCount >= 3; })
        .sort(function(a,b){ return (b.salesCount||0) - (a.salesCount||0); })
        .slice(0, 8);
    // Only show when home is active AND has qualifying products
    var homeView = document.getElementById('view-home');
    if (!homeView || !homeView.classList.contains('active')) { el.style.display = 'none'; return; }
    if (!topProds.length) { el.style.display = 'none'; return; }
    el.style.display = '';
    var grid = document.getElementById('bestsellers-grid');
    if (grid) { grid.innerHTML = ''; renderShelf('bestsellers-grid', topProds, 'badge-gold', '🏆'); }
}

function toggleFilterPanel() {
    var panel = document.getElementById('cat-filter-panel');
    var btn   = document.getElementById('filter-toggle-btn');
    if (!panel) return;
    var isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    if (btn) btn.style.borderColor = isOpen ? '#e0e8ff' : 'var(--gold)';
}

function _updateFilterDot() {
    var dot  = document.getElementById('filter-active-dot');
    var sort = (document.getElementById('filter-sort')||{}).value || '';
    var month= (document.getElementById('filter-month')||{}).value || '';
    var year = (document.getElementById('filter-year')||{}).value || '';
    var active = !!(sort || month || year);
    if (dot) dot.style.display = active ? 'inline-block' : 'none';
}

function applyProductFilter() {
    _updateFilterDot();
    var sort  = (document.getElementById('filter-sort') ||{}).value || '';
    var month = (document.getElementById('filter-month')||{}).value || '';
    var year  = (document.getElementById('filter-year') ||{}).value || '';
    _filterState = { sort:sort, month:month, year:year };
    // Filter by current category
    var items = currentCat && currentCat !== 'الكل'
        ? db.products.filter(function(p){ return p.category === currentCat; })
        : db.products.slice();
    if (year)  items = items.filter(function(p){ return p.salesDate && p.salesDate.startsWith(year); });
    if (month) items = items.filter(function(p){ return p.salesDate && p.salesDate.endsWith('-'+month); });
    if (sort==='price-asc')  items.sort(function(a,b){ return a.price-b.price; });
    if (sort==='price-desc') items.sort(function(a,b){ return b.price-a.price; });
    if (sort==='bestseller') items.sort(function(a,b){ return (b.salesCount||0)-(a.salesCount||0); });
    if (sort==='newest')     items.sort(function(a,b){ return (b.addedAt||0)-(a.addedAt||0); });
    // Render in category grid
    renderCategoryGrid(items);
}

function resetFilter() {
    ['filter-sort','filter-month','filter-year'].forEach(function(id){
        var el=document.getElementById(id); if(el) el.value='';
    });
    _filterState={sort:'',month:'',year:''};
    _updateFilterDot();
    if (currentCat && currentCat !== 'الكل') renderCategoryPage(currentCat);
    else renderProductsGrid();
}

function renderCategoryGrid(items) {
    var grid = document.getElementById('cat-page-grid');
    if (!grid) return;
    if (!items.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-gray);"><i class="fas fa-filter" style="font-size:2.5rem;display:block;margin-bottom:12px;color:#ccc;"></i><h3>لا نتائج للفلتر المحدد</h3></div>';
        return;
    }
    grid.innerHTML = items.map(function(p) {
        var src = (p.media&&p.media.trim())?p.media:'https://images.unsplash.com/photo-1553949333-f3e26e73ce76?w=400';
        var mediaEl = p.type==='vid'
            ? '<video src="'+sanitize(src)+'" autoplay loop muted playsinline></video>'
            : '<img src="'+sanitize(src)+'" alt="'+sanitize(tProd(p,"name"))+'" loading="lazy">';
        var isBest = p.salesCount && p.salesCount >= 3;
        var btn = p.aff
            ? '<a href="'+sanitize(safeUrl(p.aff))+'" target="_blank" rel="noopener" class="btn-action btn-affiliate" onclick="event.stopPropagation()"><i class="fas fa-external-link-alt"></i> '+t("buyFromAgent")+'</a>'
            : '<button class="btn-action btn-cart" onclick="event.stopPropagation();addToCart('+p.id+')"><i class="fas fa-cart-plus"></i> '+t("addToCart")+'</button>';
        return '<div class="art-card card-fadein" onclick="navigateToProduct('+p.id+')">'
            + '<div class="art-category-badge">'+sanitize(tCat(p.category))+'</div>'
            + (isBest ? '<div class="bs-star-badge">⭐</div>' : '')
            + '<div class="art-media">'+mediaEl+'</div>'
            + '<div class="art-content">'
            + '<h3 class="art-title">'+sanitize(tProd(p,"name"))+'</h3>'
            + '<div class="art-price">'+formatPrice(p.price)+'</div>'
            + btn+'</div></div>';
    }).join('');
    setTimeout(initAppleAnimations, 60);
}

/* Filter labels multilingual */
var FILTER_LABELS = {
    ar: {btn:'فلتر',sortLbl:'ترتيب حسب',all:'الكل',bs:'⭐ الأكثر مبيعاً',newest:'🆕 الأحدث',pa:'💰 سعر ↑',pd:'💰 سعر ↓',monthLbl:'الشهر',allM:'كل الأشهر',yearLbl:'السنة',allY:'كل السنوات',reset:'إعادة تعيين',
        months:['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']},
    en: {btn:'Filter',sortLbl:'Sort by',all:'All',bs:'⭐ Best Sellers',newest:'🆕 Newest',pa:'💰 Price ↑',pd:'💰 Price ↓',monthLbl:'Month',allM:'All months',yearLbl:'Year',allY:'All years',reset:'Reset',
        months:['January','February','March','April','May','June','July','August','September','October','November','December']},
    fr: {btn:'Filtrer',sortLbl:'Trier par',all:'Tout',bs:'⭐ Meilleures ventes',newest:'🆕 Plus récent',pa:'💰 Prix ↑',pd:'💰 Prix ↓',monthLbl:'Mois',allM:'Tous les mois',yearLbl:'Année',allY:'Toutes les années',reset:'Réinitialiser',
        months:['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']},
    es: {btn:'Filtrar',sortLbl:'Ordenar por',all:'Todo',bs:'⭐ Más vendidos',newest:'🆕 Más reciente',pa:'💰 Precio ↑',pd:'💰 Precio ↓',monthLbl:'Mes',allM:'Todos los meses',yearLbl:'Año',allY:'Todos los años',reset:'Restablecer',
        months:['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']},
    it: {btn:'Filtra',sortLbl:'Ordina per',all:'Tutto',bs:'⭐ Più venduti',newest:'🆕 Più recente',pa:'💰 Prezzo ↑',pd:'💰 Prezzo ↓',monthLbl:'Mese',allM:'Tutti i mesi',yearLbl:'Anno',allY:'Tutti gli anni',reset:'Ripristina',
        months:['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']},
    de: {btn:'Filtern',sortLbl:'Sortieren',all:'Alle',bs:'⭐ Bestseller',newest:'🆕 Neueste',pa:'💰 Preis ↑',pd:'💰 Preis ↓',monthLbl:'Monat',allM:'Alle Monate',yearLbl:'Jahr',allY:'Alle Jahre',reset:'Zurücksetzen',
        months:['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']},
    zh: {btn:'筛选',sortLbl:'排序方式',all:'全部',bs:'⭐ 畅销品',newest:'🆕 最新',pa:'💰 价格升序',pd:'💰 价格降序',monthLbl:'月份',allM:'所有月份',yearLbl:'年份',allY:'所有年份',reset:'重置',
        months:['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']},
};
function applyFilterLang() {
    // Fallback chain: currentLang → 'en' → 'ar'
    var L = FILTER_LABELS[currentLang] || FILTER_LABELS['en'] || FILTER_LABELS['ar'];
    var s = function(id,v){ var el=document.getElementById(id); if(el&&v!==undefined) el.textContent=v; };
    s('filter-btn-label', L.btn);
    s('fl-sort-lbl', L.sortLbl); s('fl-month-lbl', L.monthLbl); s('fl-year-lbl', L.yearLbl);
    s('fl-all', L.all); s('fl-bs', L.bs); s('fl-new', L.newest); s('fl-pa', L.pa); s('fl-pd', L.pd);
    s('fl-all-m', L.allM); s('fl-all-y', L.allY);
    var resetBtn = document.getElementById('fl-reset-btn');
    if (resetBtn) resetBtn.innerHTML = '<i class="fas fa-undo" style="margin-left:5px;"></i> ' + L.reset;
    // Translate months dynamically
    if (L.months) {
        var vals = ['01','02','03','04','05','06','07','08','09','10','11','12'];
        vals.forEach(function(v, i) {
            var opt = document.getElementById('fl-m' + v);
            if (opt) opt.textContent = L.months[i];
        });
    }
}


/* ═══ LEGAL PAGES ADMIN ═══ */
var _defaultLegalContent = {
    privacy:  { title:'🔒 سياسة الخصوصية', html: document.getElementById('view-privacy') ? document.getElementById('view-privacy').querySelector('.legal-page').innerHTML : '' },
    terms:    { title:'📋 شروط الاستخدام', html: '' },
    shipping: { title:'🚚 سياسة الشحن', html: '' },
    returns:  { title:'↩️ سياسة الإرجاع', html: '' }
};

function loadLegalPage() {
    var page = document.getElementById('legal-page-select').value;
    if (!page) return;
    var custom = db.settings.legalPages && db.settings.legalPages[page];
    var titleEl = document.getElementById('legal-title-input');
    var contentEl = document.getElementById('legal-content-input');
    if (custom) {
        if (titleEl) titleEl.value = custom.title || '';
        if (contentEl) contentEl.value = custom.html || '';
    } else {
        // Load from existing view
        var viewEl = document.getElementById('view-' + page);
        if (titleEl) titleEl.value = _defaultLegalContent[page] ? _defaultLegalContent[page].title : page;
        if (contentEl && viewEl) {
            var lp = viewEl.querySelector('.legal-page');
            contentEl.value = lp ? lp.innerHTML : '';
        }
    }
}

function saveLegalPage() {
    var page = document.getElementById('legal-page-select').value;
    var title = document.getElementById('legal-title-input').value.trim();
    var html  = document.getElementById('legal-content-input').value.trim();
    if (!db.settings.legalPages) db.settings.legalPages = {};
    db.settings.legalPages[page] = { title: title, html: html };
    saveDb();
    // Apply to view
    var viewEl = document.getElementById('view-' + page);
    if (viewEl) {
        var lp = viewEl.querySelector('.legal-page');
        if (lp) {
            lp.innerHTML = html;
            // Re-attach back button
            lp.insertAdjacentHTML('afterbegin', '<button class="legal-back" onclick="navigate(&quot;home&quot;)"><i class="fas fa-arrow-right"></i> رجوع</button>');
        }
    }
    showToast('✅ تم حفظ الصفحة: ' + title);
}

function previewLegalPage() {
    var page = document.getElementById('legal-page-select').value;
    closeAdminPanel();
    navigate(page);
}

function resetLegalPage() {
    var page = document.getElementById('legal-page-select').value;
    if (!confirm('استعادة المحتوى الافتراضي لهذه الصفحة؟')) return;
    if (db.settings.legalPages) delete db.settings.legalPages[page];
    saveDb();
    showToast('✅ تمت الاستعادة');
    loadLegalPage();
}

/* Apply saved legal content on load */
function applyLegalPages() {
    var pages = db.settings.legalPages;
    if (!pages) return;
    Object.keys(pages).forEach(function(page) {
        var viewEl = document.getElementById('view-' + page);
        if (!viewEl || !pages[page]) return;
        var lp = viewEl.querySelector('.legal-page');
        if (lp && pages[page].html) {
            lp.innerHTML = pages[page].html;
            lp.insertAdjacentHTML('afterbegin', '<button class="legal-back" onclick="navigate(&quot;home&quot;)"><i class="fas fa-arrow-right"></i> رجوع</button>');
        }
    });
}

/* ═══ ADMIN CAT: edit name + reorder ═══ */
function editCategoryName(i) {
    var oldName = db.categories[i];
    var newName = prompt('الاسم الجديد للقسم:', oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    newName = newName.trim();
    // Update products that use this category
    db.products.forEach(function(p){ if(p.category === oldName) p.category = newName; });
    // Update LANGS catNames
    ['en','fr','es','it','de','zh'].forEach(function(lang){
        if (LANGS[lang] && LANGS[lang].catNames && LANGS[lang].catNames[oldName]) {
            LANGS[lang].catNames[newName] = LANGS[lang].catNames[oldName];
            delete LANGS[lang].catNames[oldName];
        }
    });
    db.categories[i] = newName;
    saveDb(); renderCategoryBar(); updateAdminUI(); renderProductsGrid();
    showToast('✅ تم تعديل اسم القسم');
}




/* ═══ CHANNEL RENDER ═══ */
function renderChannelView() { if(!document.getElementById('view-channel')) return;
    var vids = (db.sidebarLinks || []).filter(function(l){ return l.type === 'video'; });
    var grid  = document.getElementById('channel-main-grid');
    var empty = document.getElementById('channel-empty-state');
    var ytBtn = document.getElementById('channel-yt-main-btn');
    if (!grid) return;
    // YouTube button
    var yt = db.social && db.social.yt ? safeUrl(db.social.yt) : '';
    if (ytBtn) { ytBtn.href = yt || '#'; ytBtn.style.display = yt ? '' : 'none'; }
    if (!vids.length) {
        if (empty) empty.style.display = '';
        grid.innerHTML = '';
        if (empty) grid.appendChild(empty);
        return;
    }
    if (empty) empty.style.display = 'none';
    grid.innerHTML = vids.map(function(v) {
        // Auto-generate YouTube thumbnail from URL
        var thumb = v.thumb || '';
        if (!thumb && v.url) {
            var vidId = v.url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
            if (vidId) thumb = 'https://i.ytimg.com/vi/' + vidId[1] + '/hqdefault.jpg';
        }
        thumb = thumb || 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=600';
        var url = safeUrl(v.url || '');
        return '<div class="channel-card" data-url="' + sanitize(url) + '" onclick="openChannelVideo(this.dataset.url)">'
            + '<div class="channel-thumb">'
            + '<img src="' + sanitize(thumb) + '" alt="' + sanitize(v.label||'') + '" loading="lazy">'
            + '<div class="channel-play-overlay">'
            + '<div class="channel-play-btn"><i class="fas fa-play"></i></div>'
            + '</div></div>'
            + '<div class="channel-card-body">'
            + '<div class="channel-card-title">' + sanitize(v.label||'') + '</div>'
            + '<div class="channel-card-meta"><i class="fab fa-youtube" style="color:#e00;"></i> MARASSiA Channel</div>'
            + '</div></div>';
    }).join('');
}


function saveChannelVideo(e) {
    if (!db.sidebarLinks) db.sidebarLinks = [];
    var label = (document.getElementById('ch-vid-label').value||'').trim();
    var url   = (document.getElementById('ch-vid-url').value||'').trim();
    var thumb = (document.getElementById('ch-vid-thumb').value||'').trim();
    if (!label || !url) { showToast('أدخل العنوان والرابط', 'error'); return; }
    // Auto-thumb from YouTube
    if (!thumb) {
        var vidId = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
        if (vidId) thumb = 'https://i.ytimg.com/vi/' + vidId[1] + '/hqdefault.jpg';
    }
    db.sidebarLinks.push({ id:Date.now(), label:label, type:'video', url:url, icon:'fas fa-play-circle', thumb:thumb });
    document.getElementById('ch-vid-label').value = '';
    document.getElementById('ch-vid-url').value   = '';
    document.getElementById('ch-vid-thumb').value = '';
    saveDb(); renderChannelView(); refreshChannelAdminList();
    showToast('✅ تمت إضافة الفيديو للقناة');
}

function refreshChannelAdminList() {
    var el    = document.getElementById('channel-admin-list');
    var count = document.getElementById('ch-count');
    if (!el) return;
    var vids = (db.sidebarLinks||[]).filter(function(l){ return l.type==='video'; });
    if (count) count.textContent = vids.length;
    if (!vids.length) { el.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px;">لا توجد فيديوهات بعد</p>'; return; }
    el.innerHTML = vids.map(function(v) {
        var thumb = v.thumb || 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=100';
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #eee;border-radius:11px;margin-bottom:8px;background:#fff;">'
            + '<img src="'+sanitize(thumb)+'" style="width:80px;height:48px;object-fit:cover;border-radius:7px;flex-shrink:0;">'
            + '<div style="flex:1;min-width:0;">'
            + '<div style="font-weight:800;font-size:.84rem;color:var(--dark-blue);">'+sanitize(v.label)+'</div>'
            + '<div style="font-size:.7rem;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+sanitize((v.url||'').replace('https://',''))+'</div>'
            + '</div>'
            + '<div style="display:flex;gap:5px;">'
            + '<button onclick="editChannelVideo('+v.id+')" style="background:var(--primary-blue);color:#fff;border:none;border-radius:7px;padding:4px 9px;cursor:pointer;font-size:.72rem;"><i class="fas fa-edit"></i></button>'
            + '<button onclick="deleteChannelVideoById('+v.id+')" style="background:#e74c3c;color:#fff;border:none;border-radius:7px;padding:4px 9px;cursor:pointer;font-size:.72rem;"><i class="fas fa-trash"></i></button>'
            + '</div></div>';
    }).join('');
}

function editChannelVideo(id) {
    var v = (db.sidebarLinks||[]).find(function(x){ return x.id===id; });
    if (!v) return;
    document.getElementById('ch-vid-label').value = v.label||'';
    document.getElementById('ch-vid-url').value   = v.url  ||'';
    document.getElementById('ch-vid-thumb').value = v.thumb||'';
    db.sidebarLinks = db.sidebarLinks.filter(function(x){ return x.id!==id; });
    showToast('عدّل البيانات واضغط إضافة للقناة', 'info');
}

function deleteChannelVideoById(id) {
    if (!confirm('حذف هذا الفيديو؟')) return;
    db.sidebarLinks = (db.sidebarLinks||[]).filter(function(l){ return l.id!==id; });
    saveDb(); renderChannelView(); refreshChannelAdminList();
    showToast('تم الحذف', 'info');
}


/* ═══════════════════════════════════════════════════════════
   MARASSiA PAYMENT SYSTEM v2
   Flow: Cart → Order Form → Payment → Confirmation → Record
   ═══════════════════════════════════════════════════════════ */

var _selectedPayment = 'whatsapp';
var _orderData = {};

/* ── Currency ── */
function toggleCurrencyDropdown() {
    var d = document.getElementById('currency-dropdown');
    if (d) d.classList.toggle('open');
}
document.addEventListener('click', function(e) {
    if (!e.target.closest('#currency-pill-btn') && !e.target.closest('#currency-dropdown')) {
        var d = document.getElementById('currency-dropdown');
        if (d) d.classList.remove('open');
    }
});
function setCurrency(code) {
    _userCurrency = code;
    localStorage.setItem('marassia_currency', code);
    var sym = CURRENCY_SYMBOLS[code] || code;
    var btn = document.getElementById('currency-pill-label');
    if (btn) btn.textContent = code;
    // Mark active option
    document.querySelectorAll('.currency-opt').forEach(function(el) {
        el.classList.toggle('on', el.textContent.includes(code));
    });
    document.getElementById('currency-dropdown').classList.remove('open');
    updateCartTotal();
    // Re-render cart if open
    if (document.getElementById('cart-modal').classList.contains('active')) { openCartModal(); }
    showToast('💱 العملة: ' + sym);
}
function initCurrencyFromPrefs() {
    var saved = localStorage.getItem('marassia_currency');
    if (saved) { _userCurrency = saved; }
    else if (_userProfile && _userProfile.country) {
        _userCurrency = COUNTRY_CURRENCY[_userProfile.country] || 'USD';
    }
    var btn = document.getElementById('currency-pill-label');
    if (btn) btn.textContent = _userCurrency;
    document.querySelectorAll('.currency-opt').forEach(function(el) {
        el.classList.toggle('on', el.textContent.includes(_userCurrency));
    });
}

/* ── Cart Modal: show login gate ── */
function openCartModal() {
    const cEl = document.getElementById('cart-items-container');
    let total = 0;
    if (!shoppingCart.length) {
        cEl.innerHTML = `
            <div style="text-align:center;padding:36px;color:var(--text-gray);">
                <i class="fas fa-shopping-bag" style="font-size:2.5rem;margin-bottom:12px;display:block;color:#ccc;"></i>
                <p data-i18n="emptyCart">${t('emptyCart')}</p>
            </div>`;
    } else {
        cEl.innerHTML = shoppingCart.map(item => {
            total += parseFloat(item.price || 0) * (item.qty || 1);
            return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f0f0f0;">
                <img src="${sanitize(item.media||'https://images.unsplash.com/photo-1553949333-f3e26e73ce76?w=60')}"
                     style="width:46px;height:46px;border-radius:8px;object-fit:cover;flex-shrink:0;"
                     onerror="this.src='https://images.unsplash.com/photo-1553949333-f3e26e73ce76?w=60'">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:800;font-size:.84rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sanitize(_cartItemName(item))}</div>
                    <div style="font-size:.76rem;color:var(--text-gray);">${formatPrice(item.price || 0)} × ${item.qty}</div>
                </div>
                <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
                    <button onclick="changeQty(${item.id},-1)"
                            style="width:24px;height:24px;border-radius:50%;border:1.5px solid #e0e8ff;background:#fff;cursor:pointer;font-weight:900;font-size:.85rem;display:flex;align-items:center;justify-content:center;color:var(--primary-blue);">−</button>
                    <span style="font-size:.82rem;font-weight:800;min-width:16px;text-align:center;">${item.qty}</span>
                    <button onclick="changeQty(${item.id},1)"
                            style="width:24px;height:24px;border-radius:50%;border:1.5px solid #e0e8ff;background:#fff;cursor:pointer;font-weight:900;font-size:.85rem;display:flex;align-items:center;justify-content:center;color:var(--primary-blue);">+</button>
                    <button onclick="removeFromCart(${item.id})"
                            style="width:24px;height:24px;border-radius:50%;border:1.5px solid #fecaca;background:#fff;cursor:pointer;color:#ef4444;display:flex;align-items:center;justify-content:center;font-size:.75rem;">
                        <i class="fas fa-times"></i></button>
                </div>
            </div>`;
        }).join('');
    }
    // Update total
    var totEl = document.getElementById('cart-total');
    if (totEl) totEl.textContent = formatPrice(total);

    // Login gate
    var gate = document.getElementById('cart-login-gate');
    var paySection = document.getElementById('cart-pay-section');
    if (!currentUser) {
        if (gate) gate.style.display = '';
        if (paySection) paySection.style.display = 'none';
    } else {
        if (gate) gate.style.display = 'none';
        if (paySection) paySection.style.display = '';
    }
    initCurrencyFromPrefs();
    openModal('cart-modal');
}

/* ── Payment method select ── */
function selectPayment(el) {
    document.querySelectorAll('.pay-option').forEach(function(o){ o.classList.remove('selected'); });
    el.classList.add('selected');
    _selectedPayment = el.dataset.pay;
    renderPayDetail(_selectedPayment);
    // Update confirm button
    var btn = document.getElementById('confirm-pay-btn');
    if (btn) {
        var icons = {whatsapp:'fab fa-whatsapp',card:'fas fa-credit-card',instapay:'fas fa-bolt',vodafone:'fas fa-mobile-alt',paypal:'fab fa-paypal',payoneer:'fas fa-p',crypto:'fab fa-bitcoin'};
        btn.innerHTML = '<i class="'+( icons[_selectedPayment]||'fas fa-check')+'"></i> متابعة للدفع';
    }
}

function renderPayDetail(method) {
    var area = document.getElementById('pay-detail-area');
    if (!area) return;
    var instapay = (db.payment && db.payment.instapay) || '';
    var vodafone = (db.payment && db.payment.vodafone) || '';
    var html = '';

    if (method === 'card') {
        html = '<div style="margin-top:14px;padding:16px;background:#f8faff;border-radius:14px;border:1px solid #e0e8ff;">'
            + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 12px;background:#f0fdf4;border-radius:9px;border:1px solid #bbf7d0;">'
            + '<i class="fas fa-lock" style="color:#22c55e;"></i>'
            + '<div><div style="font-size:.76rem;font-weight:900;color:#15803d;">Secured by Stripe · SSL 256-bit</div>'
            + '<div style="font-size:.68rem;color:#166534;">Your card data is never stored</div></div>'
            + '<div style="display:flex;gap:4px;margin-right:auto;">'
            + '<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Visa_Inc._logo.svg/200px-Visa_Inc._logo.svg.png" height="16" alt="Visa" style="vertical-align:middle;">'  
            + '<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/200px-Mastercard-logo.svg.png" height="20" alt="MC" style="vertical-align:middle;">'  
            + '</div></div>'
            + '<div id="stripe-card-container" style="padding:12px;background:#fff;border:1.5px solid #e0e8ff;border-radius:10px;min-height:44px;"></div>'
            + '<div id="stripe-card-errors" style="color:#ef4444;font-size:.74rem;margin-top:6px;min-height:16px;"></div>'
            + '</div>';
        area.innerHTML = html;
        setTimeout(function(){ mountStripeCard('stripe-card-container'); }, 150);
        return;

    } else if (method === 'instapay') {
        html = '<div style="background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border-radius:12px;padding:16px;margin-top:12px;text-align:center;border:1px solid #bae6fd;">'
            + '<i class="fas fa-bolt" style="font-size:1.6rem;color:#0284c7;display:block;margin-bottom:8px;"></i>'
            + '<p style="font-size:.82rem;color:#0369a1;margin-bottom:8px;font-weight:700;">حوّل المبلغ على رقم InstaPay:</p>'
            + '<div style="font-size:1.4rem;font-weight:900;color:#0284c7;background:#fff;padding:10px 20px;border-radius:10px;display:inline-block;border:2px solid #bae6fd;">' + (instapay||'—') + '</div>'
            + '<p style="font-size:.75rem;color:#64748b;margin-top:10px;">بعد التحويل أرسل إيصال التحويل عبر واتساب</p></div>';

    } else if (method === 'vodafone') {
        html = '<div style="background:linear-gradient(135deg,#fff1f1,#fee2e2);border-radius:12px;padding:16px;margin-top:12px;text-align:center;border:1px solid #fecaca;">'
            + '<i class="fas fa-mobile-alt" style="font-size:1.6rem;color:#dc2626;display:block;margin-bottom:8px;"></i>'
            + '<p style="font-size:.82rem;color:#b91c1c;margin-bottom:8px;font-weight:700;">حوّل المبلغ على رقم المحفظة:</p>'
            + '<div style="font-size:1.4rem;font-weight:900;color:#dc2626;background:#fff;padding:10px 20px;border-radius:10px;display:inline-block;border:2px solid #fecaca;">' + (vodafone||'—') + '</div>'
            + '<p style="font-size:.75rem;color:#64748b;margin-top:10px;">يدعم: Vodafone Cash · Etisalat · Orange</p></div>';

    } else if (method === 'paypal') {
        html = '<div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:12px;padding:16px;margin-top:12px;text-align:center;border:1px solid #bfdbfe;">'
            + '<img src="https://www.paypalobjects.com/webstatic/mktg/Logo/pp-logo-100px.png" height="28" alt="PayPal" style="display:block;margin:0 auto 12px;">'
            + '<div id="paypal-button-container" style="max-width:280px;margin:0 auto;"></div>'
            + '</div>';
        var totalAmt = shoppingCart.reduce(function(s,i){ return s+parseFloat(i.price||0)*(i.qty||1); }, 0);
        area.innerHTML = html;
        setTimeout(function(){ renderPayPalButton('paypal-button-container', totalAmt); }, 200);
        return;

    } else if (method === 'payoneer') {
        html = '<div style="background:linear-gradient(135deg,#fff8f0,#ffedd5);border-radius:12px;padding:16px;margin-top:12px;text-align:center;border:1px solid #fed7aa;">'
            + '<div style="font-size:1.6rem;font-weight:900;color:#FF4800;margin-bottom:8px;">Payoneer</div>'
            + '<p style="font-size:.82rem;color:#c2410c;">سيتم إرسال رابط طلب الدفع عبر Payoneer بعد تأكيد الطلب</p></div>';

    } else if (method === 'crypto') {
        var btcAddr = (db.settings && db.settings.bitcoinAddress) || '';
        html = '<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:12px;padding:16px;margin-top:12px;text-align:center;border:1px solid #f59e0b;">'
            + '<span style="font-size:2rem;display:block;margin-bottom:6px;">₿</span>'
            + '<p style="font-size:.82rem;color:#fbbf24;font-weight:700;margin-bottom:8px;">Bitcoin Wallet Address</p>'
            + (btcAddr
                ? '<div style="font-size:.7rem;font-family:monospace;color:#e2e8f0;background:rgba(255,255,255,.08);padding:10px;border-radius:8px;word-break:break-all;">' + btcAddr + '</div>'
                : '<p style="font-size:.78rem;color:#94a3b8;">سيتم إرسال عنوان المحفظة عبر واتساب</p>')
            + '<p style="font-size:.7rem;color:#64748b;margin-top:10px;">BTC · ETH · USDT accepted</p></div>';
    }

    area.innerHTML = html;
}

/* ── Avatar preview ── */
function previewOrderAvatar(input) {
    if (!input.files || !input.files[0]) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var img = document.getElementById('order-avatar-preview');
        var icon = document.getElementById('order-avatar-icon');
        if (img) { img.src = e.target.result; img.style.display = 'block'; }
        if (icon) icon.style.display = 'none';
    };
    reader.readAsDataURL(input.files[0]);
}

/* ── Start Checkout: open order form ── */
function startCheckout() {
    if (!currentUser) {
        closeModal('cart-modal');
        openModal('login-modal');
        showToast('سجّل دخولك أولاً لإتمام الطلب', 'error');
        return;
    }
    if (!shoppingCart.length) { showToast('السلة فارغة', 'error'); return; }

    // Populate order summary
    var items = shoppingCart.map(function(item) {
        var p = db.products.find(function(x){ return x.id === item.id; });
        return (p ? tProd(p,'name') : item.name||'') + ' × ' + item.qty;
    }).join(' · ');
    var totalUSD = shoppingCart.reduce(function(s,i){ return s+parseFloat(i.price||0)*(i.qty||1); }, 0);

    var totEl = document.getElementById('order-total-display');
    if (totEl) totEl.textContent = formatPrice(totalUSD);
    // Cart count badge
    var countEl = document.getElementById('order-cart-count');
    if (countEl) countEl.textContent = shoppingCart.reduce(function(s,i){return s+(i.qty||1);},0);
    // Detail items
    var detEl = document.getElementById('order-items-detail');
    if (detEl) detEl.innerHTML = shoppingCart.map(function(item){
        var p=db.products.find(function(x){return x.id===item.id;});
        var src=(p&&p.media)||'https://images.unsplash.com/photo-1553949333-f3e26e73ce76?w=60';
        return '<div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid #e0e8ff;">'
            +'<img src="'+sanitize(src)+'" style="width:38px;height:38px;border-radius:7px;object-fit:cover;flex-shrink:0;">'
            +'<div style="flex:1;font-size:.8rem;"><div style="font-weight:800;">'+sanitize(_cartItemName(item))+'</div>'
            +'<div style="color:#888;">'+formatPrice(item.price||0)+' × '+item.qty+'</div></div>'
            +'<div style="font-weight:900;color:var(--primary-blue);font-size:.82rem;">'+formatPrice((item.price||0)*(item.qty||1))+'</div>'
            +'</div>';
    }).join('');

    // Pre-fill name from profile
    var nameEl = document.getElementById('order-fullname');
    if (nameEl && _userProfile && _userProfile.displayName) nameEl.value = _userProfile.displayName;

    closeModal('cart-modal');
    openModal('order-form-modal');
}

/* ── Proceed to payment from order form ── */
function proceedToPayment() {
    var name    = (document.getElementById('order-fullname').value||'').trim();
    var address = (document.getElementById('order-address').value||'').trim();
    var phone1  = (document.getElementById('order-phone1').value||'').replace(/\s/g,'');
    var notes   = (document.getElementById('order-notes').value||'').trim();

    if (!name)    { showToast('أدخل اسمك الكامل', 'error'); return; }
    if (!address) { showToast('أدخل عنوان التوصيل', 'error'); return; }
    if (!phone1 || phone1.length < 7) { showToast('أدخل رقم هاتف صحيح', 'error'); return; }

    _orderData = {
        id: 'ORD-' + Date.now(),
        name, address, phone1,
        phone2:  (document.getElementById('order-phone2').value||'').trim(),
        notes,
        items:   shoppingCart.slice(),
        totalUSD: shoppingCart.reduce(function(s,i){ return s+parseFloat(i.price||0)*(i.qty||1); }, 0),
        currency: _userCurrency,
        payment:  _selectedPayment,
        userEmail: currentUser || '',
        date:     new Date().toLocaleString('ar-EG'),
        timestamp: Date.now(),
        status:   'pending'
    };
    _orderData.totalDisplay = formatPrice(_orderData.totalEGP);

    closeModal('order-form-modal');
    openModal('cart-modal');
    // Now confirm payment
    confirmPayment();
}

/* ── Confirm Payment ── */
async function confirmPayment() {
    if (!_orderData.id) { startCheckout(); return; }

    var method = _selectedPayment;
    var order  = _orderData;

    // Stripe card validation
    if (method === 'card') {
        var pmId = await processStripePayment(order.totalUSD || 0);
        if (!pmId) return; // Stripe validation failed
        order.stripePaymentMethodId = pmId;
        order.status = 'confirmed'; // card payment pre-confirmed
    }

    // PayPal is handled by PayPal SDK directly, skip here
    if (method === 'paypal') { return; }

    // Save to DB
    if (!db.orders) db.orders = [];
    db.orders.unshift(order);
    saveDb();

    // WhatsApp message (always)
    var wa = (db.settings && db.settings.whatsapp) || '';
    if (wa) {
        var lines = [
            '🛍️ *طلب جديد — MARASSiA*',
            '─────────────────────',
            '👤 ' + order.name,
            '📞 ' + order.phone1 + (order.phone2 ? ' / ' + order.phone2 : ''),
            '📍 ' + order.address,
            '',
            '📦 *المنتجات:*',
        ];
        var orderItems = order.items || shoppingCart;
    orderItems.forEach(function(item) {
            var p = db.products.find(function(x){ return x.id===item.id; });
            lines.push('• ' + (p?tProd(p,'name'):item.name||'منتج') + ' × ' + item.qty + ' = ' + formatPrice((item.price||0)*item.qty));
        });
        lines.push('');
        lines.push('💰 *الإجمالي: ' + order.totalDisplay + '*');
        lines.push('💳 *طريقة الدفع: ' + method.toUpperCase() + '*');
        if (order.notes) lines.push('📝 ' + order.notes);
        lines.push('─────────────────────');
        lines.push('🔖 رقم الطلب: ' + order.id);
        var msg = encodeURIComponent(lines.join('\n'));
        window.open('https://wa.me/' + wa.replace(/\D/g,'') + '?text=' + msg, '_blank');
    }

    // Clear cart
    shoppingCart = [];
    try { localStorage.removeItem('marassia_cart'); } catch(e){}
    updateCartBadge();
    closeModal('cart-modal');
    showToast('🎉 تم إرسال طلبك بنجاح! رقم الطلب: ' + order.id);
    sendLocalNotification('MARASSiA — طلب جديد ✅', 'رقم طلبك: ' + order.id + ' · بانتظار التأكيد');
    _askNotificationOnOrder();
    _orderData = {};
}


/* ═══ ORDERS ADMIN ═══ */
function renderOrdersAdmin() {
    var orders = db.orders || [];
    var filter = (document.getElementById('order-filter-status')||{}).value || '';
    if (filter) orders = orders.filter(function(o){ return o.status === filter; });

    var all = db.orders || [];
    var stats = document.getElementById('orders-stats');
    if (stats) {
        var totalRev = all.filter(function(o){ return o.status==='paid'; })
            .reduce(function(s,o){ return s+(o.totalEGP||0); }, 0);
        stats.innerHTML = [
            {v:all.length, l:'إجمالي الطلبات', c:'#3b6fff'},
            {v:all.filter(function(o){ return o.status==='paid'; }).length, l:'مدفوعة ✅', c:'#22c55e'},
            {v:all.filter(function(o){ return o.status==='pending'; }).length, l:'قيد الانتظار ⏳', c:'#f59e0b'},
            {v:formatPrice(totalRev), l:'إجمالي الإيرادات', c:'var(--gold)'},
        ].map(function(s){ return '<div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:14px;text-align:center;">'
            +'<div style="font-size:1.4rem;font-weight:900;color:'+s.c+'">'+s.v+'</div>'
            +'<div style="font-size:.72rem;color:#888;margin-top:3px;">'+s.l+'</div></div>'; }).join('');
    }

    var el = document.getElementById('orders-admin-list');
    if (!el) return;
    if (!orders.length) { el.innerHTML='<div style="text-align:center;padding:40px;color:#aaa;"><i class="fas fa-inbox" style="font-size:2.5rem;display:block;margin-bottom:12px;"></i>لا توجد طلبات</div>'; return; }

    var stColors = {pending:'status-pending',paid:'status-paid',failed:'status-failed',refunded:'status-refunded'};
    var stLabels = {pending:'⏳ قيد الانتظار',paid:'✅ مدفوع',failed:'❌ فاشل',refunded:'↩️ مسترد'};

    el.innerHTML = '';
    orders.forEach(function(o) {
        var items = (o.items||[]).map(function(i){
            var p=db.products.find(function(x){return x.id===i.id;});
            return (p?p.name:i.name||'منتج')+' ×'+i.qty;
        }).join(', ');

        var div = document.createElement('div');
        div.className = 'pay-record';
        div.innerHTML = '<div style="flex:1;min-width:200px;">'
            + '<div style="font-weight:900;font-size:.88rem;color:var(--dark-blue);">' + sanitize(o.name||'') + '</div>'
            + '<div style="font-size:.75rem;color:#888;">' + sanitize(o.id||'') + ' · ' + sanitize(o.date||'') + '</div>'
            + '<div style="font-size:.78rem;color:#555;margin-top:3px;">' + sanitize(items.slice(0,60)) + '</div>'
            + '<div style="font-size:.75rem;color:#888;">📞 '+sanitize(o.phone1||'')+'  📍 '+sanitize((o.address||'').slice(0,40))+'</div>'
            + '</div>'
            + '<div style="text-align:center;min-width:90px;">'
            + '<div style="font-weight:900;color:var(--primary-blue);font-size:.9rem;">' + (o.totalDisplay||formatPrice(o.totalEGP||0)) + '</div>'
            + '<div style="font-size:.7rem;color:#aaa;">' + (o.payment||'').toUpperCase() + '</div>'
            + '</div>'
            + '<div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;">'
            + '<span class="pay-record-status ' + (stColors[o.status]||'status-pending') + '">' + (stLabels[o.status]||o.status) + '</span>'
            + '<div style="display:flex;gap:4px;"></div></div>';

        // Action buttons via DOM (avoid quote issues)
        var btnRow = div.querySelector('div[style*="gap:4px"]');
        var mkBtn = function(color, icon, handler) {
            var b = document.createElement('button');
            b.style.cssText = 'background:'+color+';color:#fff;border:none;border-radius:6px;padding:3px 7px;cursor:pointer;font-size:.66rem;';
            b.innerHTML = '<i class="fas fa-'+icon+'"></i>';
            b.addEventListener('click', handler);
            btnRow.appendChild(b);
        };
        var orderId = o.id;
        mkBtn('#22c55e','check', function(){ setOrderStatus(orderId,'paid'); });
        mkBtn('#6366f1','undo',  function(){ setOrderStatus(orderId,'refunded'); });
        mkBtn('#ef4444','trash', function(){ deleteOrder(orderId); });
        el.appendChild(div);
    });
}


function deleteOrder(id) {
    if (!confirm('حذف هذا الطلب نهائياً؟')) return;
    db.orders = (db.orders||[]).filter(function(x){ return x.id!==id; });
    saveDb(); renderOrdersAdmin(); showToast('تم الحذف', 'info');
}

function exportOrdersCSV() { exportOrders(); }
function exportOrders() {
    var orders = db.orders || [];
    var rows = [['رقم الطلب','الاسم','الهاتف','العنوان','المبلغ','العملة','طريقة الدفع','الحالة','التاريخ']];
    orders.forEach(function(o){
        rows.push([o.id,o.name,o.phone1,o.address,o.totalEGP,o.currency,o.payment,o.status,o.date]);
    });
    var csv = rows.map(function(r){ return r.map(function(v){ return '"'+(v||'').toString().replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
    var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'marassia-orders-'+new Date().toISOString().slice(0,10)+'.csv';
    a.click();
    showToast('✅ تم تصدير الطلبات CSV');
}


function toggleOrderCart() {
    var el = document.getElementById('order-cart-items');
    var ch = document.getElementById('order-cart-chevron');
    if (!el) return;
    var open = el.style.display !== 'none';
    el.style.display = open ? 'none' : 'block';
    if (ch) ch.style.transform = open ? '' : 'rotate(180deg)';
}


/* ═══ QR CODE ═══ */
function openProductQR(id, event) {
    if (event) event.stopPropagation();
    var p = db.products.find(function(x){ return x.id === id; });
    if (!p) return;
    var url = (window.location.origin + window.location.pathname).replace(/\/+$/, '') + '?prod=' + id;
    document.getElementById('qr-prod-name').textContent = tProd(p, 'name') || p.name;
    document.getElementById('qr-url-label').textContent = url;
    var container = document.getElementById('qr-code-container');
    container.innerHTML = '';
    try {
        new QRCode(container, {
            text: url,
            width: 200, height: 200,
            colorDark: '#001a66', colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
    } catch(e) {
        container.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='+encodeURIComponent(url)+'" width="200" height="200">';
    }
    openModal('qr-modal');
}


function updateCartTotal() {
    var total = shoppingCart.reduce(function(s,i){ return s+parseFloat(i.price||0)*(i.qty||1); }, 0);
    var el = document.getElementById('cart-total');
    if (el) el.textContent = formatPrice(total);
}


/* ═══ HERO ANIMATED BACKGROUND ═══ */
function initHeroCanvas() {
    var cv = document.getElementById('hero-canvas');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var W, H;
    function rsz() {
        var hero = document.getElementById('main-hero');
        if (!hero) return;
        W = cv.width  = hero.offsetWidth;
        H = cv.height = hero.offsetHeight;
    }
    rsz();
    window.addEventListener('resize', rsz);

    // Floating orbs
    var orbs = Array.from({length:6}, function(_,i) {
        return {
            x: Math.random()*100, y: Math.random()*100,
            r: 35 + Math.random()*70,
            vx: (Math.random()-.5)*.04, vy: (Math.random()-.5)*.03,
            hue: i%2===0 ? 220 : 45,  // blue or gold
            a: .12 + Math.random()*.15
        };
    });
    // Particles
    var pts = Array.from({length:35}, function() {
        return {
            x: Math.random()*100, y: Math.random()*100,
            vx:(Math.random()-.5)*.04, vy:(Math.random()-.5)*.04,
            r:.5+Math.random()*1.5, a:.15+Math.random()*.4
        };
    });

    (function draw() {
        if (!cv.parentElement) return; // stop if removed
        requestAnimationFrame(draw);
        ctx.clearRect(0,0,W,H);
        // Orbs
        orbs.forEach(function(o) {
            o.x+=o.vx; o.y+=o.vy;
            if(o.x<-30||o.x>130) o.vx*=-1;
            if(o.y<-30||o.y>130) o.vy*=-1;
            var grd = ctx.createRadialGradient(o.x/100*W,o.y/100*H,0,o.x/100*W,o.y/100*H,o.r);
            grd.addColorStop(0,'hsla('+o.hue+',100%,60%,'+o.a+')');
            grd.addColorStop(1,'hsla('+o.hue+',80%,40%,0)');
            ctx.beginPath(); ctx.arc(o.x/100*W,o.y/100*H,o.r,0,6.28);
            ctx.fillStyle=grd; ctx.fill();
        });
        // Stars/particles
        pts.forEach(function(p) {
            p.x+=p.vx; p.y+=p.vy;
            if(p.x<0)p.x=100; if(p.x>100)p.x=0;
            if(p.y<0)p.y=100; if(p.y>100)p.y=0;
            ctx.beginPath(); ctx.arc(p.x/100*W,p.y/100*H,p.r,0,6.28);
            ctx.fillStyle='rgba(255,255,255,'+p.a+')';
            ctx.fill();
        });
    })();
}


/* ═══ QR PAGES BAR ═══ */
var _qrPageItems = [
    { id:'home',    label:'الرئيسية',  icon:'fas fa-home' },
    { id:'blog',    label:'المدونة',   icon:'fas fa-newspaper' },
    { id:'channel', label:'Channel',   icon:'fab fa-youtube' },
    { id:'ai',      label:'AI',        icon:'fas fa-robot' },
    { id:'privacy', label:'Privacy',   icon:'fas fa-lock' },
    { id:'terms',   label:'Terms',     icon:'fas fa-file-alt' },
];

function renderQRPagesBar() {
    var grid = document.getElementById('qr-pages-grid');
    if (!grid) return;
    var base = (window.location.origin + window.location.pathname).replace(/\/+$/, '');
    grid.innerHTML = '';
    _qrPageItems.forEach(function(item) {
        var url = base + (item.id === 'home' ? '' : '?view=' + item.id);
        var div = document.createElement('div');
        div.className = 'qr-page-item';
        div.title = item.label;
        var box = document.createElement('div');
        box.className = 'qr-page-box';
        var lbl = document.createElement('div');
        lbl.className = 'qr-page-label';
        lbl.textContent = item.label;
        div.appendChild(box);
        div.appendChild(lbl);
        // Generate QR
        try {
            new QRCode(box, {
                text: url, width: 56, height: 56,
                colorDark: '#001a66', colorLight: '#fff',
                correctLevel: QRCode.CorrectLevel.L
            });
        } catch(e) {
            box.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=56x56&data='+encodeURIComponent(url)+'">';
        }
        div.addEventListener('click', function() { navigate(item.id); window.scrollTo({top:0,behavior:'smooth'}); });
        grid.appendChild(div);
    });
}


function openCurrentPageQR() {
    var view = document.querySelector('.view-section.active');
    var viewId = view ? view.id.replace('view-','') : 'home';
    var base = (window.location.origin + window.location.pathname).replace(/\/+$/, '');
    var url  = viewId === 'home' ? base : base + '?view=' + viewId;
    var labels = {home:'الرئيسية',blog:'المدونة',channel:'Channel',ai:'AI',category:'القسم',privacy:'الخصوصية',terms:'الشروط',shipping:'الشحن',returns:'الإرجاع'};
    document.getElementById('qr-prod-name').textContent = (labels[viewId] || viewId) + ' — MARASSiA';
    document.getElementById('qr-url-label').textContent = url;
    var container = document.getElementById('qr-code-container');
    container.innerHTML = '';
    try {
        new QRCode(container, { text:url, width:200, height:200, colorDark:'#001a66', colorLight:'#ffffff', correctLevel:QRCode.CorrectLevel.H });
    } catch(e) {
        container.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='+encodeURIComponent(url)+'" width="200" height="200">';
    }
    openModal('qr-modal');
}


/* ═══ ADMIN BIOMETRIC (WebAuthn) ═══ */
var _bioCredId = null;

async function registerBiometric() {
    if (!window.PublicKeyCredential) {
        showToast('المتصفح لا يدعم البصمة', 'error'); return;
    }
    try {
        var challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        var cred = await navigator.credentials.create({
            publicKey: {
                challenge: challenge,
                rp: { name: 'MARASSiA Admin', id: window.location.hostname || 'localhost' },
                user: { id: new TextEncoder().encode('admin'), name: 'admin', displayName: 'MARASSiA Admin' },
                pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
                authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required' },
                timeout: 30000
            }
        });
        _bioCredId = Array.from(new Uint8Array(cred.rawId)).join(',');
        localStorage.setItem('marassia_bio_id', _bioCredId);
        showToast('✅ تم تسجيل البصمة بنجاح! يمكنك الدخول بها الآن');
        var bioBtn = document.getElementById('admin-bio-btn');
        if (bioBtn) bioBtn.style.display = 'none';
        var bioUse = document.getElementById('admin-bio-use-btn');
        if (bioUse) bioUse.style.display = 'flex';
    } catch(e) {
        showToast('فشل التسجيل: ' + (e.message||e), 'error');
    }
}

async function loginBiometric() {
    var savedId = localStorage.getItem('marassia_bio_id');
    if (!savedId) { showToast('سجّل البصمة أولاً من داخل الأدمن', 'error'); return; }
    if (!window.PublicKeyCredential) { showToast('المتصفح لا يدعم البصمة', 'error'); return; }
    try {
        var challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        var idBytes = new Uint8Array(savedId.split(',').map(Number));
        await navigator.credentials.get({
            publicKey: {
                challenge: challenge,
                allowCredentials: [{ id: idBytes.buffer, type: 'public-key' }],
                userVerification: 'required',
                timeout: 30000
            }
        });
        // Bio verified — open admin
        document.getElementById('admin-modal').classList.add('active');
        document.getElementById('admin-pass-modal').classList.remove('active');
        updateAdminUI();
        showToast('✅ تم التحقق بالبصمة');
    } catch(e) {
        showToast('فشل التحقق: ' + (e.message||'حاول مجدداً'), 'error');
    }
}


/* ═══ CART HELPER FUNCTIONS ═══ */
function saveCart() {
    try { localStorage.setItem('marassia_cart', JSON.stringify(shoppingCart)); } catch(e){}
}

function updateCartBadge() {
    var total = shoppingCart.reduce(function(s,i){ return s+(i.qty||1); }, 0);
    var badge = document.getElementById('cart-badge');
    if (badge) badge.innerText = total;
}

function changeQty(productId, delta) {
    var idx = shoppingCart.findIndex(function(i){ return i.id === productId; });
    if (idx < 0) return;
    var item = shoppingCart[idx];
    if (!item.qty) item.qty = 1;
    item.qty += delta;
    if (item.qty <= 0) {
        shoppingCart.splice(idx, 1);
    }
    saveCart();
    updateCartBadge();
    openCartModal();  // refresh cart view
}

function removeFromCart(productId) {
    shoppingCart = shoppingCart.filter(function(i){ return i.id !== productId; });
    saveCart();
    updateCartBadge();
    openCartModal();  // refresh cart view
}


/* ═══ VIEW REGISTERED USERS (Admin) ═══ */
function loadRegisteredUsers() {
    if (!fbDB) { showToast('Firebase غير متصل', 'error'); return; }
    var el = document.getElementById('users-admin-list');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:20px;color:#888;"><i class="fas fa-spinner fa-spin"></i> جارٍ التحميل...</div>';
    // Users stored in Firebase under 'users/' path
    fbDB.ref('users').once('value').then(function(snap) {
        var users = snap.val() || {};
        var list = Object.values(users);
        if (!list.length) {
            el.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px;">لا توجد حسابات مسجّلة بعد</p>';
            return;
        }
        // Sort by createdAt desc
        list.sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); });
        var countEl = document.getElementById('users-count');
        if (countEl) countEl.textContent = list.length;
        el.innerHTML = list.map(function(u) {
            var flag = {EG:'🇪🇬',SA:'🇸🇦',AE:'🇦🇪',PS:'🇵🇸',US:'🇺🇸',GB:'🇬🇧',FR:'🇫🇷',DE:'🇩🇪',OTHER:'🌍'}[u.country||'OTHER']||'🌍';
            return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #eee;border-radius:10px;margin-bottom:6px;background:#fff;">'
                + '<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,var(--dark-blue),var(--primary-blue));color:#fff;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">'
                + (u.firstName||'?').charAt(0).toUpperCase() + '</div>'
                + '<div style="flex:1;min-width:0;">'
                + '<div style="font-weight:800;font-size:.85rem;">' + sanitize(u.displayName||u.firstName||'—') + '</div>'
                + '<div style="font-size:.75rem;color:#888;">' + sanitize(u.email||'') + '</div>'
                + '<div style="font-size:.7rem;color:#aaa;">' + flag + ' ' + sanitize(u.country||'—') + ' · ' + (u.gender==='male'?'ذكر':'أنثى') + ' · ' + sanitize(u.language||'ar').toUpperCase() + '</div>'
                + '</div>'
                + '<div style="text-align:left;font-size:.7rem;color:#aaa;">' + sanitize(u.createdDate||'') + '</div>'
                + '</div>';
        }).join('');
    }).catch(function(e) {
        el.innerHTML = '<p style="color:red;padding:12px;">خطأ: ' + e.message + '</p>';
    });
}

function exportUsers() {
    if (!fbDB) { showToast('Firebase غير متصل', 'error'); return; }
    fbDB.ref('users').once('value').then(function(snap) {
        var users = Object.values(snap.val()||{});
        var rows = [['الاسم','البريد','الدولة','الجنس','تاريخ الميلاد','اللغة','تاريخ التسجيل']];
        users.forEach(function(u){ rows.push([u.displayName,u.email,u.country,u.gender,u.dob,u.language,u.createdDate]); });
        var csv = rows.map(function(r){ return r.map(function(v){ return '"'+(v||'').toString().replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
        var blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
        var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
        a.download='marassia-users-'+new Date().toISOString().slice(0,10)+'.csv'; a.click();
        showToast('✅ تم تصدير ' + users.length + ' مستخدم');
    });
}


/* ═══ AI ADMIN TAB ═══ */
function renderAIAdminTab() {
    var key = _getApiKey();
    var dot = document.getElementById('ai-key-dot');
    var status = document.getElementById('ai-key-status');
    if (dot) dot.style.background = key ? '#22c55e' : '#f59e0b';
    if (status) status.textContent = key ? '✅ مفتاح محفوظ — AI جاهز (sk...'+key.slice(-4)+')' : '⚠️ لم يتم إضافة مفتاح بعد';
    var inp = document.getElementById('ai-apikey-input');
    if (inp) inp.placeholder = key ? '••••••• (محفوظ — أدخل جديد للتغيير)' : 'sk-ant-api03-...';
    // Load settings
    var s = db.settings || {};
    var prompt = document.getElementById('ai-system-prompt');
    if (prompt) prompt.value = s.aiSystemPrompt || '';
    var mode = document.getElementById('ai-default-mode');
    if (mode) mode.value = s.aiDefaultMode || 'recommend';
    var greet = document.getElementById('ai-greeting');
    if (greet) greet.value = s.aiGreeting || '';
    // Stats
    var translated = db.products.filter(function(p){ return p.translations && Object.keys(p.translations).length >= 7; }).length;
    var statsEl = document.getElementById('ai-stats');
    var translatedBlogs = db.blogs.filter(function(b){ return b.translations && Object.keys(b.translations).length >= 7; }).length;
    var totalRev = Object.values(db.reviews||{}).reduce(function(s,r){ return s+r.length; }, 0);
    var totalOrders = (db.orders||[]).length;
    if (statsEl) statsEl.innerHTML =
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
        + '<div style="background:#f0f4ff;border-radius:10px;padding:12px;"><div style="font-size:1.4rem;font-weight:900;color:var(--primary-blue);">' + db.products.length + '</div><div style="font-size:.72rem;color:#888;">منتج</div></div>'
        + '<div style="background:#f0fdf4;border-radius:10px;padding:12px;"><div style="font-size:1.4rem;font-weight:900;color:#22c55e;">' + translated + '/' + db.products.length + '</div><div style="font-size:.72rem;color:#888;">مترجم</div></div>'
        + '<div style="background:#fefce8;border-radius:10px;padding:12px;"><div style="font-size:1.4rem;font-weight:900;color:#d97706;">' + totalOrders + '</div><div style="font-size:.72rem;color:#888;">طلب</div></div>'
        + '<div style="background:#fdf4ff;border-radius:10px;padding:12px;"><div style="font-size:1.4rem;font-weight:900;color:#9333ea;">' + totalRev + '</div><div style="font-size:.72rem;color:#888;">تقييم</div></div>'
        + '</div>'
        + '<div style="margin-top:10px;font-size:.78rem;color:#555;"><span style="color:#22c55e;">✓</span> مقالات مترجمة: ' + translatedBlogs + '/' + db.blogs.length + ' &nbsp;|&nbsp; أقسام: ' + db.categories.length + '</div>';
}

function saveAIKey() {
    var inp = document.getElementById('ai-apikey-input');
    if (!inp || !inp.value.trim() || inp.value.startsWith('•')) { showToast('أدخل المفتاح أولاً', 'error'); return; }
    if (!db.settings) db.settings = {};
    db.settings.apiKey = inp.value.trim();
    localStorage.setItem('marassia_api_key', db.settings.apiKey);
    saveDb();
    inp.value = '';
    renderAIAdminTab();
    showToast('✅ تم حفظ API Key — AI جاهز للعمل!');
}

function saveAISettings() {
    if (!db.settings) db.settings = {};
    var prompt = document.getElementById('ai-system-prompt');
    var mode = document.getElementById('ai-default-mode');
    var greet = document.getElementById('ai-greeting');
    if (prompt) db.settings.aiSystemPrompt = prompt.value.trim();
    if (mode) db.settings.aiDefaultMode = mode.value;
    if (greet) db.settings.aiGreeting = greet.value.trim();
    saveDb();
    showToast('✅ تم حفظ إعدادات AI');
}


/* ═══ PERFORMANCE ═══ */
function _debounce(fn, delay) {
    var t;
    return function() {
        var args = arguments, ctx = this;
        clearTimeout(t);
        t = setTimeout(function(){ fn.apply(ctx, args); }, delay);
    };
}
// Debounce search
var _debouncedSearch = _debounce(handleSmartSearch, 250);


function _aiMaintenanceMsg() {
    var msgs = {
        ar:'الأداة قيد الصيانة والتطوير، يرجى المحاولة لاحقاً 🛠️',
        en:'This feature is currently under maintenance. Please try again later 🛠️',
        fr:'Cette fonctionnalité est en cours de maintenance. Veuillez réessayer plus tard 🛠️',
        es:'Esta función está en mantenimiento. Por favor, inténtelo más tarde 🛠️',
        de:'Diese Funktion wird gewartet. Bitte versuchen Sie es später erneut 🛠️',
        zh:'该功能正在维护中，请稍后再试 🛠️',
        it:'Questa funzione è in manutenzione. Riprova più tardi 🛠️'
    };
    return msgs[currentLang] || msgs['en'];
}


/* ═══ DARK MODE ═══ */
function _applyDarkUI(isDark) {
    var icon  = document.getElementById('dark-icon');
    var label = document.getElementById('dark-label');
    var dot   = document.getElementById('dark-pill-dot');
    var pill  = document.getElementById('dark-mode-pill');
    if (icon)  icon.textContent  = isDark ? '☀️' : '🌙';
    if (label) label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    if (dot)   dot.style.right   = isDark ? '18px' : '2px';
    if (pill)  pill.style.background = isDark ? 'var(--gold)' : 'rgba(255,255,255,.2)';
}
function toggleDarkMode() {
    var isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('marassia_dark', isDark ? '1' : '0');
    _applyDarkUI(isDark);
}
function initDarkMode() {
    var saved = localStorage.getItem('marassia_dark');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === '1' || (saved === null && prefersDark)) {
        document.body.classList.add('dark-mode');
        _applyDarkUI(true);
    }
}


/* ═══ LEGAL PAGES LANGUAGE ═══ */
var _legalLangCache = {};
async function translateLegalPage(viewId) {
    if (currentLang === 'ar') return; // Arabic is default
    var viewEl = document.getElementById('view-' + viewId);
    if (!viewEl) return;
    var lp = viewEl.querySelector('.legal-page');
    if (!lp) return;
    var cacheKey = viewId + '_' + currentLang;
    if (_legalLangCache[cacheKey]) { lp.innerHTML = _legalLangCache[cacheKey]; return; }
    var textEls = lp.querySelectorAll('p, li, h2');
    for (var i = 0; i < textEls.length; i++) {
        var el = textEls[i];
        var txt = el.textContent.trim();
        if (txt.length < 3) continue;
        var langMap = {en:'en',fr:'fr',es:'es',de:'de',zh:'zh-CN',it:'it'};
        var translated = await _smartTranslate(txt, langMap[currentLang] || 'en', 'ar');
        if (translated && translated !== txt) el.textContent = translated;
        await new Promise(function(r){ setTimeout(r,50); });
    }
    _legalLangCache[cacheKey] = lp.innerHTML;
}


/* ═══════════════════════════════════════════════
   ORDER MANAGEMENT SYSTEM
   ═══════════════════════════════════════════════ */

var ORDER_STATUSES = {
    pending:   { ar:'⏳ قيد الانتظار',   en:'Pending',    color:'#f59e0b', bg:'#fef3c7' },
    confirmed: { ar:'✅ مؤكّد',           en:'Confirmed',  color:'#3b82f6', bg:'#dbeafe' },
    shipped:   { ar:'🚚 تم الشحن',        en:'Shipped',    color:'#8b5cf6', bg:'#ede9fe' },
    delivered: { ar:'📦 تم التسليم',      en:'Delivered',  color:'#22c55e', bg:'#d1fae5' },
    cancelled: { ar:'❌ ملغي',            en:'Cancelled',  color:'#ef4444', bg:'#fee2e2' },
    refunded:  { ar:'↩️ مُسترد',          en:'Refunded',   color:'#6366f1', bg:'#e0e7ff' },
};

function getOrderStatus(status) {
    return ORDER_STATUSES[status] || ORDER_STATUSES.pending;
}

function getOrderStatusLabel(status) {
    var s = getOrderStatus(status);
    return currentLang === 'ar' ? s.ar : s.en;
}

/* Generate unique readable order ID */
function _genOrderId() {
    var d = new Date();
    var yy = String(d.getFullYear()).slice(2);
    var mm = String(d.getMonth()+1).padStart(2,'0');
    var dd = String(d.getDate()).padStart(2,'0');
    var rnd = Math.floor(Math.random()*9000)+1000;
    return 'MAR-'+yy+mm+dd+'-'+rnd;
}

/* Update order status (admin) */
function setOrderStatus(id, status) {
    var o = (db.orders||[]).find(function(x){ return x.id===id; });
    if (!o) return;
    o.status = status;
    o.updatedAt = Date.now();
    saveDb();
    renderOrdersAdmin();
    showToast('✅ الطلب '+id+' → '+getOrderStatusLabel(status));
    // Send WhatsApp notification to customer
    if (db.settings && db.settings.whatsapp && o.phone1) {
        var msg = 'MARASSiA — تحديث طلبك\n'
            + 'رقم الطلب: ' + o.id + '\n'
            + 'الحالة الجديدة: ' + getOrderStatusLabel(status) + '\n'
            + 'شكراً لثقتك بـ MARASSiA 🙏';
        var wa = 'https://wa.me/'+o.phone1.replace(/\D/g,'')+'?text='+encodeURIComponent(msg);
        if (confirm('هل تريد إرسال إشعار WhatsApp للعميل '+o.name+'؟')) {
            window.open(wa, '_blank');
        }
    }
}

/* Customer order history */
function getMyOrders() {
    if (!currentUser) return [];
    return (db.orders||[]).filter(function(o){
        return o.userEmail === currentUser || o.uid === currentUser;
    });
}

/* Enhanced confirmPayment with better order creation */
function _buildOrder(orderData, paymentMethod) {
    var orderId = _genOrderId();
    return Object.assign({}, orderData, {
        id:          orderId,
        status:      'pending',
        payment:     paymentMethod,
        createdAt:   Date.now(),
        updatedAt:   Date.now(),
        currency:    _userCurrency,
        totalDisplay: formatPrice(orderData.totalUSD || 0),
    });
}


/* ═══ PWA + PUSH NOTIFICATIONS ═══ */
var _swReg = null;

async function initPWA() {
    /* ── Manifest via blob ── */
    if (!document.querySelector('link[rel="manifest"]')) {
        var mf = {
            name:"MARASSiA",short_name:"MARASSiA",
            description:"منصة متكاملة",
            start_url:"/",scope:"/",
            display:"standalone",background_color:"#000510",theme_color:"#0a0c14",
            lang:"ar",dir:"rtl",
            icons:[
                {src:"/logo.jpg",sizes:"192x192",type:"image/jpeg",purpose:"any maskable"},
                {src:"/logo.jpg",sizes:"512x512",type:"image/jpeg",purpose:"any maskable"},
                {src:"/favicon.png",sizes:"96x96",type:"image/png"}
            ],
            shortcuts:[
                {name:"المتجر",url:"/store",icons:[{src:"/logo.jpg",sizes:"96x96"}]},
                {name:"الصحة",url:"/medical",icons:[{src:"/logo.jpg",sizes:"96x96"}]}
            ]
        };
        var mblob = new Blob([JSON.stringify(mf)], {type:'application/manifest+json'});
        var mlink = document.createElement('link');
        mlink.rel='manifest'; mlink.href=URL.createObjectURL(mblob);
        document.head.appendChild(mlink);
        var tcMeta = document.querySelector('meta[name="theme-color"]');
        if(!tcMeta){ tcMeta=document.createElement('meta'); tcMeta.name='theme-color'; document.head.appendChild(tcMeta); }
        tcMeta.content='#0a0c14';
        ['apple-mobile-web-app-capable:yes','apple-mobile-web-app-status-bar-style:black-translucent'].forEach(function(pair){
            var p=pair.split(':'); if(!document.querySelector('meta[name="'+p[0]+'"]')){var m=document.createElement('meta');m.name=p[0];m.content=p[1];document.head.appendChild(m);}
        });
    }
    if (!('serviceWorker' in navigator)) return;
    try {
        var CACHE_V = 'marassia-v3';
        var ASSETS  = JSON.stringify(['/','/store','/medical','/index.html','/app.js','/style.css','/logo.jpg','/favicon.ico']);
        var swStr = ''
            + 'var C=' + JSON.stringify(CACHE_V) + ';'
            + 'var A=' + ASSETS + ';'
            + 'self.addEventListener("install",function(e){'
            +   'e.waitUntil(caches.open(C).then(function(c){return c.addAll(A);}).catch(function(){}));'
            +   'self.skipWaiting();'
            + '});'
            + 'self.addEventListener("activate",function(e){'
            +   'e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==C;}).map(function(k){return caches.delete(k);}));}));'
            +   'self.clients.claim();'
            + '});'
            + 'self.addEventListener("fetch",function(e){'
            +   'var r=e.request;'
            +   'if(r.method!=="GET"||r.url.includes("firebaseio")||r.url.includes("googleapis")||r.url.includes("cloudinary"))return;'
            +   'e.respondWith(caches.match(r).then(function(cached){'
            +     'var fresh=fetch(r).then(function(res){if(res.ok){var cl=res.clone();caches.open(C).then(function(c){c.put(r,cl);});}return res;}).catch(function(){return cached;});'
            +     'return cached||fresh;'
            +   '}));'
            + '});';
        var swBlob = new Blob([swStr], {type:'text/javascript'});
        var swUrl  = URL.createObjectURL(swBlob);
        navigator.serviceWorker.register(swUrl, {scope:'/'}).then(function(reg){
            console.log('[PWA] SW v3 registered');
        }).catch(function(e){ console.warn('[PWA]', e.message); });
        window.addEventListener('beforeinstallprompt', function(e){
            e.preventDefault(); window._pwaPrompt=e; _showPWAInstallBtn();
        });
    } catch(e) { console.warn('[PWA] init:', e.message); }
}

function _showPWAInstallBtn() {
    if (document.getElementById('pwa-install-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'pwa-install-btn';
    var lang = (typeof currentLang !== 'undefined' ? currentLang : 'ar');
    var labels = {ar:'📲 تثبيت التطبيق',en:'📲 Install App',fr:'📲 Installer',es:'📲 Instalar',de:'📲 Installieren',zh:'📲 安装应用',it:'📲 Installa'};
    btn.textContent = labels[lang]||labels.ar;
    btn.onclick = function() {
        if (window._pwaPrompt) {
            window._pwaPrompt.prompt();
            window._pwaPrompt.userChoice.then(function(r){ if(r.outcome==='accepted') btn.remove(); });
        }
    };
    btn.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:900;'
        +'background:linear-gradient(135deg,#0033cc,#1a53ff);color:#fff;border:none;border-radius:24px;'
        +'padding:11px 24px;font-family:Cairo,sans-serif;font-size:.88rem;font-weight:800;cursor:pointer;'
        +'box-shadow:0 8px 24px rgba(0,51,204,.4);animation:pwaSlideUp .4s ease;white-space:nowrap;';
    document.body.appendChild(btn);
    setTimeout(function(){ if(btn.parentNode) btn.style.animation='pwaSlideDown .4s ease forwards'; setTimeout(function(){btn.remove();},400); }, 12000);
}
async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    var perm = await Notification.requestPermission();
    return perm === 'granted';
}

function sendLocalNotification(title, body, url) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
        var n = new Notification(title, {
            body: body,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'marassia-notify'
        });
        if (url) n.onclick = function(){ window.open(url); };
        setTimeout(function(){ n.close(); }, 6000);
    } catch(e) {}
}

/* Ask for notification permission on first order */
function _askNotificationOnOrder() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        setTimeout(function(){
            if (confirm('تفعيل الإشعارات لمتابعة طلباتك؟')) {
                requestNotificationPermission().then(function(ok){
                    if(ok) showToast('✅ الإشعارات مُفعَّلة');
                });
            }
        }, 2000);
    }
}


/* ═══ CLOUDINARY IMAGE UPLOAD ═══ */
var CLOUDINARY_CLOUD  = 'djwu48mix';
var CLOUDINARY_PRESET = 'MARASSiA';
var CLOUDINARY_IMG_URL   = 'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD + '/image/upload';
var CLOUDINARY_VIDEO_URL = 'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD + '/video/upload';
var CLOUDINARY_URL = CLOUDINARY_IMG_URL; // default

function uploadToCloudinary(file, onProgress, onDone) {
    var isVideo = file.type && file.type.startsWith('video/');
    var uploadUrl = isVideo ? CLOUDINARY_VIDEO_URL : CLOUDINARY_IMG_URL;
    var fd = new FormData();
    fd.append('file',          file);
    fd.append('upload_preset', CLOUDINARY_PRESET);
    fd.append('folder',        isVideo ? 'marassia-videos' : 'marassia-products');
    var xhr = new XMLHttpRequest();
    xhr.open('POST', CLOUDINARY_URL, true);
    if (onProgress) {
        xhr.upload.onprogress = function(e) {
            if (e.lengthComputable) onProgress(Math.round(e.loaded/e.total*100));
        };
    }
    xhr.onload = function() {
        if (xhr.status === 200) {
            var res = JSON.parse(xhr.responseText);
            onDone(null, res.secure_url);
        } else {
            onDone('Upload failed: ' + xhr.statusText, null);
        }
    };
    xhr.onerror = function(){ onDone('Network error', null); };
    xhr.send(fd);
}

function handleProductImageUpload(inputEl, targetInputId, progressId) {
    var file = inputEl.files && inputEl.files[0];
    if (!file) return;
    // Show progress
    var progressEl = document.getElementById(progressId);
    if (progressEl) { progressEl.style.display='block'; progressEl.textContent='0%'; }
    showToast('⏳ جارٍ رفع الصورة على Cloudinary...', 'info');
    uploadToCloudinary(file,
        function(pct) {
            if (progressEl) progressEl.textContent = pct + '%';
        },
        function(err, url) {
            if (progressEl) progressEl.style.display='none';
            if (err) { showToast('❌ فشل الرفع: ' + err, 'error'); return; }
            var target = document.getElementById(targetInputId);
            if (target) { target.value = url; }
            showToast('✅ تم رفع الصورة على Cloudinary 🌩️');
            // Show preview
            var preview = document.getElementById('p-img-preview');
            if (preview) { preview.src = url; preview.style.display = 'block'; }
        }
    );
}


/* ═══ STRIPE PAYMENT ═══ */
var STRIPE_PK = 'pk_test_51TEbKr83QpLLdTn9nf6mSRAGI0z9C7omdewgjIlB8lWUk2nN3NMjajdJtuG4DXPG1UfkFajbUi2rt9NRPEEsH20I00UKwCHsc3';
var _stripe   = null;
var _stripeElements = null;
var _stripeCardEl   = null;

function initStripe() {
    if (typeof Stripe === 'undefined') return;
    _stripe = Stripe(STRIPE_PK);
    console.log('[Stripe] Initialized');
}

function mountStripeCard(containerId) {
    if (!_stripe) { initStripe(); }
    if (!_stripe) { console.warn('[Stripe] not loaded'); return; }
    var elements = _stripe.elements({
        appearance: {
            theme: 'stripe',
            variables: {
                colorPrimary:       '#0033cc',
                colorBackground:    '#ffffff',
                colorText:          '#001a66',
                fontFamily:         'Cairo, sans-serif',
                borderRadius:       '10px',
            }
        }
    });
    _stripeElements = elements;
    var card = elements.create('card', {
        style: {
            base: { fontFamily: 'Cairo, sans-serif', fontSize: '16px', color: '#001a66' }
        },
        hidePostalCode: true
    });
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    card.mount(container);
    _stripeCardEl = card;
    card.on('change', function(e) {
        var errEl = document.getElementById('stripe-card-errors');
        if (errEl) errEl.textContent = e.error ? e.error.message : '';
    });
}

async function processStripePayment(amountUSD) {
    if (!_stripe || !_stripeCardEl) {
        showToast('Stripe غير جاهز — حاول مرة أخرى', 'error'); return false;
    }
    // In TEST mode: create PaymentIntent on client (production needs server)
    // For now: simulate with tokenization
    try {
        var result = await _stripe.createPaymentMethod({
            type: 'card',
            card: _stripeCardEl,
        });
        if (result.error) {
            var errEl = document.getElementById('stripe-card-errors');
            if (errEl) errEl.textContent = result.error.message;
            showToast('❌ ' + result.error.message, 'error');
            return false;
        }
        // Payment method created: result.paymentMethod.id
        console.log('[Stripe] Payment method:', result.paymentMethod.id);
        showToast('✅ بيانات الكارت تم التحقق منها');
        return result.paymentMethod.id;
    } catch(e) {
        showToast('خطأ Stripe: ' + e.message, 'error');
        return false;
    }
}


/* ═══ PAYPAL PAYMENT ═══ */
var _paypalRendered = false;

function renderPayPalButton(containerId, amountUSD) {
    if (typeof paypal === 'undefined') {
        console.warn('[PayPal] SDK not loaded');
        return;
    }
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    _paypalRendered = true;

    paypal.Buttons({
        style: {
            layout:  'vertical',
            color:   'gold',
            shape:   'pill',
            label:   'paypal',
            height:  40
        },
        createOrder: function(data, actions) {
            return actions.order.create({
                purchase_units: [{
                    amount: {
                        value:    amountUSD.toFixed(2),
                        currency_code: 'USD'
                    },
                    description: 'MARASSiA Order — ' + (_orderData.id || '')
                }]
            });
        },
        onApprove: function(data, actions) {
            return actions.order.capture().then(function(details) {
                var name = details.payer.name.given_name;
                showToast('✅ تم الدفع بنجاح عبر PayPal! شكراً ' + name);
                // Save payment details to order
                if (_orderData.id) {
                    var o = (db.orders||[]).find(function(x){ return x.id===_orderData.id; });
                    if (o) {
                        o.status = 'confirmed';
                        o.paypalOrderId = data.orderID;
                        o.paidAt = Date.now();
                        saveDb();
                    }
                }
                sendLocalNotification('MARASSiA — دفع مؤكّد ✅', 'تم الدفع عبر PayPal بنجاح');
                // Clear cart + close modals
                shoppingCart = [];
                try{ localStorage.removeItem('marassia_cart'); }catch(e){}
                updateCartBadge();
                closeModal('order-form-modal');
                closeModal('cart-modal');
            });
        },
        onError: function(err) {
            console.error('[PayPal]', err);
            showToast('❌ خطأ في PayPal: ' + (err.message||''), 'error');
        },
        onCancel: function() {
            showToast('تم إلغاء الدفع عبر PayPal', 'info');
        }
    }).render(container);
}


function _animateProductCards() {
    var grids = ['#products-grid', '#bestsellers-grid', '#trending-shelf .shelf-inner', '#bestsellers-shelf .shelf-inner'];
    grids.forEach(function(sel){
        var cards = document.querySelectorAll(sel + ' .art-card, ' + sel + ' .shelf-card');
        if (!cards.length) return;
        cards.forEach(function(card, i) {
            card.style.opacity = '0';
            card.style.transform = 'translateY(22px) scale(.96)';
            card.style.transition = 'opacity .38s ease, transform .38s ease';
            setTimeout(function() {
                card.style.opacity = '1';
                card.style.transform = 'none';
                card.classList.add('in-view');
            }, 60 + i * 70); // stagger 70ms — wave effect
        });
    });
}


window.addEventListener('popstate',function(){ _restoreView(); });


/* ── Force sync local → Firebase (call from admin) ── */
function forceSyncToFirebase() {
    if (!fbDB) { showToast('Firebase غير متصل', 'error'); return; }
    showToast('⏳ جارٍ المزامنة...', 'info');
    var toSync = JSON.parse(JSON.stringify(db));
    if (toSync.products) toSync.products = toSync.products.map(function(p){
        var q=Object.assign({},p); if(q.media&&q.media.startsWith('data:')) q.media=''; return q;
    });
    fbDB.ref(FB_PATH).set(toSync).then(function(){
        showToast('✅ تمت مزامنة كل البيانات مع Firebase بنجاح!');
    }).catch(function(e){ showToast('❌ فشل: '+e.message, 'error'); });
}

/* ═══ GEMINI AI (Google) ════════════════════════════
   Free tier: Gemini 1.5 Flash — no credit card needed
   Get key: aistudio.google.com/app/apikey
════════════════════════════════════════════════════ */
function _apiFetchGemini(body, key) {
    var msgs = body.messages || [];
    var contents = [];
    var system = body.system || '';
    if (system) {
        contents.push({role:'user',   parts:[{text:system}]});
        contents.push({role:'model',  parts:[{text:'فهمت، سأتبع هذه التعليمات.'}]});
    }
    msgs.forEach(function(m){
        contents.push({role: m.role==='assistant'?'model':'user', parts:[{text: String(m.content)}]});
    });
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key='+key;
    return fetch(url, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
            contents: contents,
            generationConfig: { maxOutputTokens: body.max_tokens||800, temperature:0.75 }
        })
    }).then(function(res){ return res.json(); }).then(function(data){
        if (data.error) throw new Error(data.error.message || 'Gemini error');
        var text='';
        try{ text=data.candidates[0].content.parts[0].text; }catch(e){}
        // Return Anthropic-compatible format for existing code
        return { content:[{type:'text', text:text}] };
    });
}

/* ═══ MEDICAL PATH ════════════════════════════════════
   /medical — 3 sub-sections
   أدوية (learn+buy) | أدوات طبية (learn+buy) | استشارات (learn only)
════════════════════════════════════════════════════ */

var MEDICAL_CARDS = [
    {
        id:'pharma',
        emoji:'💊',
        icon:'fas fa-pills',
        color:'linear-gradient(135deg,#0a1628,#1a3a5c)',
        accent:'#3b82f6',
        glow:'rgba(59,130,246,.35)',
        mode:'buy',
        labels:{ar:'الأدوية',en:'Medicines',fr:'Medicaments',es:'Medicamentos',de:'Medikamente',zh:'药品',it:'Farmaci'},
        subs:{ar:'تعلّم واشتري',en:'Learn & Buy',fr:'Apprendre & Acheter',es:'Aprender y Comprar',de:'Lernen & Kaufen',zh:'学习与购买',it:'Impara e Acquista'},
        desc:{ar:'أدوية معتمدة مع معلومات دقيقة',en:'Certified medicines with full information',fr:'Médicaments certifiés',es:'Medicamentos certificados',de:'Zertifizierte Medikamente',zh:'认证药品',it:'Farmaci certificati'},
    },
    {
        id:'tools',
        emoji:'🩺',
        icon:'fas fa-stethoscope',
        color:'linear-gradient(135deg,#06141e,#0d3347)',
        accent:'#06b6d4',
        glow:'rgba(6,182,212,.35)',
        mode:'buy',
        labels:{ar:'الأدوات الطبية',en:'Medical Tools',fr:'Outils Medicaux',es:'Herramientas Medicas',de:'Medizinische Geraete',zh:'医疗器械',it:'Strumenti Medici'},
        subs:{ar:'تعلّم واشتري',en:'Learn & Buy',fr:'Apprendre & Acheter',es:'Aprender y Comprar',de:'Lernen & Kaufen',zh:'学习与购买',it:'Impara e Acquista'},
        desc:{ar:'أجهزة ومستلزمات طبية معتمدة',en:'Certified medical devices',fr:'Dispositifs certifies',es:'Dispositivos certificados',de:'Zertifizierte Geraete',zh:'认证医疗设备',it:'Dispositivi certificati'},
    },
    {
        id:'consult',
        emoji:'🩻',
        icon:'fas fa-user-md',
        color:'linear-gradient(135deg,#0a1f0a,#1a4020)',
        accent:'#22c55e',
        glow:'rgba(34,197,94,.35)',
        mode:'learn',
        labels:{ar:'الاستشارات الطبية',en:'Medical Advice',fr:'Conseils Medicaux',es:'Consejos Medicos',de:'Medizinische Beratung',zh:'医疗咨询',it:'Consulenza Medica'},
        subs:{ar:'تعلّم فقط',en:'Learn Only',fr:'Apprendre Seulement',es:'Solo Aprender',de:'Nur Lernen',zh:'仅供学习',it:'Solo Imparare'},
        desc:{ar:'معلومات صحية للتثقيف فقط • لا تُغني عن طبيب',en:'Health info for education only • Not medical advice',fr:'Info sante educative uniquement',es:'Info de salud educativa solo',de:'Nur Bildungszwecke',zh:'仅供教育目的',it:'Solo scopo educativo'},
    },
];

var MEDICAL_LABELS = {
    ar:{title:'الصحة والطب',sub:'اختر ما تريد',warning:'⚠️ المعلومات الطبية للتثقيف فقط — استشر طبيبك دائماً',back:'← العودة',comingSoon:'قريباً'},
    en:{title:'Health & Medicine',sub:'Choose what you need',warning:'⚠️ Medical info for education only — always consult your doctor',back:'← Back',comingSoon:'Coming Soon'},
    fr:{title:'Sante & Medecine',sub:'Choisissez',warning:'⚠️ Info medicale educative seulement',back:'← Retour',comingSoon:'Bientot'},
    es:{title:'Salud & Medicina',sub:'Elige lo que necesitas',warning:'⚠️ Info medica educativa solo',back:'← Volver',comingSoon:'Pronto'},
    de:{title:'Gesundheit & Medizin',sub:'Waehlen Sie',warning:'⚠️ Nur Bildungszwecke',back:'← Zurueck',comingSoon:'Demnachst'},
    zh:{title:'健康与医学',sub:'选择您需要的',warning:'⚠️ 仅供教育目的',back:'← 返回',comingSoon:'即将推出'},
    it:{title:'Salute & Medicina',sub:'Scegli cosa ti serve',warning:'⚠️ Solo scopo educativo',back:'← Indietro',comingSoon:'Presto'},
};

function renderMedicalHero() {
    var hero = document.getElementById('medical-hero');
    if (!hero) return;
    var lang = (typeof currentLang !== 'undefined' ? currentLang : 'ar');
    var lbl  = (typeof MEDICAL_LABELS !== 'undefined' && MEDICAL_LABELS[lang]) ? MEDICAL_LABELS[lang] : (typeof MEDICAL_LABELS !== 'undefined' ? MEDICAL_LABELS.ar : {title:'الصحة والطب',sub:'اختر ما تريد',warning:'⚠️ للتثقيف فقط',back:'← رجوع',comingSoon:'قريباً'});

    var html = '<div class="med-hero-wrap">'
        + '<div class="med-hero-top">'
        +   '<button class="med-back-btn" onclick="navigate(\'crossroads\')">' + (lbl.back || '← رجوع') + '</button>'
        +   '<div class="med-hero-logo"><i class="fas fa-heartbeat"></i></div>'
        +   '<h1 class="med-hero-title">' + (lbl.title || 'الصحة والطب') + '</h1>'
        +   '<p class="med-hero-sub">' + (lbl.sub || '') + '</p>'
        + '</div>'
        + '<div class="med-warning"><i class="fas fa-exclamation-triangle"></i>&nbsp;' + (lbl.warning || '') + '</div>'
        + '<div class="med-cards">';

    if (typeof MEDICAL_CARDS !== 'undefined') {
        MEDICAL_CARDS.forEach(function(card, i) {
            var label = (card.labels && card.labels[lang]) || card.labels.ar;
            var sub   = (card.subs   && card.subs[lang])   || card.subs.ar;
            var desc  = (card.desc   && card.desc[lang])   || card.desc.ar;
            html += '<div class="med-card" style="animation-delay:' + (i*0.12) + 's;--med-glow:' + card.glow + ';--med-accent:' + card.accent + '"'
                +  ' data-card="' + card.id + '" onclick="enterMedicalCard(this.dataset.card)">'
                +  '<div class="med-card-bg" style="background:' + card.color + '"></div>'
                +  '<div class="med-card-aurora"></div>'
                +  '<div class="med-card-content">'
                +    '<div class="med-card-emoji">' + card.emoji + '</div>'
                +    '<div class="med-card-icon"><i class="' + card.icon + '"></i></div>'
                +    '<div class="med-card-label">' + sanitize(label) + '</div>'
                +    '<div class="med-card-mode ' + (card.mode === 'buy' ? 'mode-buy' : 'mode-learn') + '"><i class="fas fa-' + (card.mode === 'buy' ? 'shopping-bag' : 'book-open') + '"></i>&nbsp;' + sanitize(sub) + '</div>'
                +    '<div class="med-card-desc">' + sanitize(desc) + '</div>'
                +  '</div>'
                + '</div>';
        });
    }

    html += '</div>';

    // Specialty search + browser section
    if (typeof MEDICAL_DB !== 'undefined') {
        var specTitles = {ar:'التخصصات الطبية',en:'Medical Specialties',fr:'Spécialités',es:'Especialidades',de:'Fachgebiete',zh:'医学专科',it:'Specialità'};
        var searchTitles = {ar:'بحث في التشخيصات',en:'Search Diagnoses',fr:'Chercher',es:'Buscar',de:'Suchen',zh:'搜索诊断',it:'Cerca'};
        html += '<div class="med-browser">';
        html += '<div class="med-browser-search">'
            + '<input type="text" id="med-search" class="med-search-input" placeholder="' + (searchTitles[lang] || searchTitles.ar) + '..." oninput="searchMedical(this.value)" autocomplete="off">'
            + '</div>';
        html += '<h2 class="med-spec-title">' + (specTitles[lang] || specTitles.ar) + ' (' + Object.keys(MEDICAL_DB).length + ')</h2>';
        html += '<div class="med-spec-grid">';
        Object.keys(MEDICAL_DB).forEach(function(spec) {
            var count = MEDICAL_DB[spec].length;
            html += '<div class="med-spec-card" data-spec="' + sanitize(spec) + '" onclick="showMedSpecialty(this.dataset.spec)">'
                + '<div class="med-spec-name">' + sanitize(spec) + '</div>'
                + '<div class="med-spec-count">' + count + ' تشخيص</div>'
                + '</div>';
        });
        html += '</div>';
        html += '<div id="med-diagnoses-panel" style="display:none;"></div>';
        html += '</div>';
    }

    html += '</div>';
    hero.innerHTML = html;
}

function showMedSpecialty(spec) {
    var panel = document.getElementById('med-diagnoses-panel');
    if (!panel || !spec || typeof MEDICAL_DB === 'undefined') return;
    var diags = MEDICAL_DB[spec] || [];
    var lang  = (typeof currentLang !== 'undefined' ? currentLang : 'ar');
    var sevLbl = {ar:'الخطورة',en:'Severity',fr:'Sévérité',es:'Gravedad',de:'Schwere',zh:'严重性',it:'Gravità'};
    var symLbl = {ar:'الأعراض',en:'Symptoms',fr:'Symptômes',es:'Síntomas',de:'Symptome',zh:'症状',it:'Sintomi'};
    var tstLbl = {ar:'الفحوصات',en:'Tests',fr:'Examens',es:'Pruebas',de:'Tests',zh:'检查',it:'Test'};
    var trtLbl = {ar:'العلاج',en:'Treatment',fr:'Traitement',es:'Tratamiento',de:'Behandlung',zh:'治疗',it:'Trattamento'};

    panel.style.display = 'block';
    // Mark active
    document.querySelectorAll('.med-spec-card').forEach(function(c){ c.classList.remove('active'); });
    var activeCard = document.querySelector('[data-spec="' + CSS.escape(spec) + '"]');
    if (activeCard) { activeCard.classList.add('active'); activeCard.scrollIntoView({behavior:'smooth',block:'nearest'}); }

    panel.innerHTML = '<h3 class="med-diag-title">' + sanitize(spec) + ' <span>(' + diags.length + ')</span></h3>'
        + '<div class="med-diag-grid">'
        + diags.map(function(d) {
            var sev = typeof SEVERITY_CONFIG !== 'undefined' ? (SEVERITY_CONFIG[d.severity] || {}) : {};
            var sevColor = sev.color || '#6b7a99';
            var sevBg    = sev.bg    || 'rgba(107,122,153,.1)';
            return '<div class="med-diag-card" onclick="toggleMedDiag(this)">'
                + '<div class="med-diag-header">'
                + '<div class="med-diag-name">' + sanitize(d.name) + '</div>'
                + '<div class="med-diag-en">' + sanitize(d.en || '') + '</div>'
                + '<span class="med-diag-sev" style="background:' + sevBg + ';color:' + sevColor + '">' + sanitize(d.severity) + '</span>'
                + '</div>'
                + '<div class="med-diag-body">'
                + '<div class="med-diag-row"><span class="med-diag-lbl">' + (symLbl[lang]||symLbl.ar) + ':</span>' + sanitize(d.symptoms) + '</div>'
                + '<div class="med-diag-row"><span class="med-diag-lbl">' + (tstLbl[lang]||tstLbl.ar) + ':</span>' + sanitize(d.tests) + '</div>'
                + '<div class="med-diag-row"><span class="med-diag-lbl">' + (trtLbl[lang]||trtLbl.ar) + ':</span>' + sanitize(d.treatments) + '</div>'
                + '</div></div>';
        }).join('')
        + '</div>';
    panel.scrollIntoView({behavior:'smooth', block:'start'});
}

function toggleMedDiag(el) {
    el.classList.toggle('expanded');
}

function searchMedical(query) {
    if (!query || query.length < 2) { renderMedicalHero(); return; }
    query = query.toLowerCase();
    var results = [];
    if (typeof MEDICAL_DB !== 'undefined') {
        Object.keys(MEDICAL_DB).forEach(function(spec) {
            MEDICAL_DB[spec].forEach(function(d) {
                if (d.name.includes(query) || (d.en || '').toLowerCase().includes(query) ||
                    (d.symptoms || '').includes(query) || (d.treatments || '').includes(query)) {
                    results.push({spec:spec, diag:d});
                }
            });
        });
    }
    var panel = document.getElementById('med-diagnoses-panel');
    if (!panel) return;
    panel.style.display = 'block';
    if (!results.length) { panel.innerHTML = '<p style="text-align:center;padding:20px;color:#aaa;">لا نتائج</p>'; return; }
    var lang = (typeof currentLang !== 'undefined' ? currentLang : 'ar');
    panel.innerHTML = '<h3 class="med-diag-title">نتائج البحث <span>(' + results.length + ')</span></h3><div class="med-diag-grid">'
        + results.slice(0,30).map(function(r) {
            var d = r.diag;
            var sev = typeof SEVERITY_CONFIG !== 'undefined' ? (SEVERITY_CONFIG[d.severity] || {}) : {};
            return '<div class="med-diag-card" onclick="toggleMedDiag(this)">'
                + '<div class="med-diag-header">'
                + '<div class="med-diag-name">' + sanitize(d.name) + '</div>'
                + '<div class="med-diag-en" style="font-size:.67rem;color:#6b7a99;">' + sanitize(r.spec) + ' • ' + sanitize(d.en||'') + '</div>'
                + '<span class="med-diag-sev" style="background:' + (sev.bg||'rgba(107,122,153,.1)') + ';color:' + (sev.color||'#6b7a99') + '">' + sanitize(d.severity) + '</span>'
                + '</div>'
                + '<div class="med-diag-body">'
                + '<div class="med-diag-row"><span class="med-diag-lbl">أعراض:</span>' + sanitize(d.symptoms) + '</div>'
                + '<div class="med-diag-row"><span class="med-diag-lbl">فحوصات:</span>' + sanitize(d.tests) + '</div>'
                + '<div class="med-diag-row"><span class="med-diag-lbl">علاج:</span>' + sanitize(d.treatments) + '</div>'
                + '</div></div>';
        }).join('') + '</div>';
}

function enterMedicalCard(cardId) {
    var lang = (typeof currentLang !== 'undefined' ? currentLang : 'ar');
    var lbl  = MEDICAL_LABELS[lang] || MEDICAL_LABELS.ar;
    showToast(lbl.comingSoon + ' 🚀', 'info');
}

/* ── Hook medical into navigate / restoreView ── */

/* ═══ MEDICAL DIAGNOSES DATABASE ═══════════════════════
   153 diagnoses across 13 specialties
════════════════════════════════════════════════════ */
var MEDICAL_DB = {"قلب وأوعية دموية":[{"id":"cv001","name":"احتشاء عضلة القلب","en":"Myocardial Infarction","symptoms":"ألم صدري شديد، ضيق تنفس، تعرق بارد","severity":"طارئ","tests":"ECG، تروبونين، إيكو","treatments":"أسبرين، هيبارين، قسطرة"},{"id":"cv002","name":"ذبحة صدرية","en":"Angina Pectoris","symptoms":"ألم صدري مع مجهود، انتشار للذراع","severity":"متوسط","tests":"ECG إجهاد","treatments":"نيتروجليسرين، حاصرات بيتا"},{"id":"cv003","name":"قصور القلب","en":"Heart Failure","symptoms":"ضيق تنفس، تورم أطراف، إجهاد","severity":"مرتفع","tests":"إيكو، BNP","treatments":"مدرات بول، ACE inhibitors"},{"id":"cv004","name":"رجفان أذيني","en":"Atrial Fibrillation","symptoms":"خفقان، دوخة، ضيق تنفس غير منتظم","severity":"متوسط","tests":"ECG، هولتر","treatments":"مضادات تخثر، تنظيم إيقاع"},{"id":"cv005","name":"ارتفاع ضغط الدم","en":"Hypertension","symptoms":"صداع، رؤية ضبابية، نزيف أنفي","severity":"مزمن","tests":"قياس ضغط متكرر","treatments":"حاصرات ACE، مدرات"},{"id":"cv006","name":"انسداد رئوي","en":"Pulmonary Embolism","symptoms":"ضيق تنفس مفاجئ، ألم صدري، نفث دم","severity":"طارئ","tests":"CT أنجيو، D-dimer","treatments":"مضادات تخثر"},{"id":"cv007","name":"التهاب التامور","en":"Pericarditis","symptoms":"ألم صدري حاد يزداد مع الاستلقاء","severity":"متوسط","tests":"ECG، إيكو","treatments":"NSAIDs، كولشيسين"},{"id":"cv008","name":"تضيق الصمام الأبهري","en":"Aortic Stenosis","symptoms":"إغماء، ضيق تنفس، ذبحة مع مجهود","severity":"مرتفع","tests":"إيكو دوبلر","treatments":"استبدال الصمام TAVR"},{"id":"cv009","name":"قصور الصمام التاجي","en":"Mitral Regurgitation","symptoms":"ضيق تنفس، إجهاد، خفقان","severity":"متوسط","tests":"إيكو دوبلر","treatments":"مدرات بول، إصلاح جراحي"},{"id":"cv010","name":"اعتلال عضلة القلب","en":"Cardiomyopathy","symptoms":"ضيق تنفس، تورم، إجهاد","severity":"مرتفع","tests":"إيكو، MRI قلبي","treatments":"أدوية قصور القلب، ICD"},{"id":"cv011","name":"تسلخ الشريان الأورطي","en":"Aortic Dissection","symptoms":"ألم صدري ظهري مفاجئ شديد","severity":"طارئ","tests":"CT أنجيو طارئ","treatments":"جراحة أو تدخلي طارئ"},{"id":"cv012","name":"كتلة قلبية كاملة","en":"Complete Heart Block","symptoms":"بطء نبض شديد، إغماء","severity":"طارئ","tests":"ECG","treatments":"منظم نبض دائم"},{"id":"cv013","name":"صدمة قلبية","en":"Cardiogenic Shock","symptoms":"انخفاض ضغط، برودة أطراف، قلة بول","severity":"طارئ","tests":"إيكو، مراقبة","treatments":"دوبامين، بالون أبهري"},{"id":"cv014","name":"توقف القلب","en":"Cardiac Arrest","symptoms":"فقدان وعي، انعدام نبض","severity":"طارئ","tests":"ECG فوري","treatments":"CPR، إنعاش متقدم ACLS"},{"id":"cv015","name":"بطء القلب الجيبي","en":"Sinus Bradycardia","symptoms":"دوخة، إجهاد، إغماء أحياناً","severity":"متوسط","tests":"ECG، هولتر","treatments":"أتروبين، منظم نبض"}],"أعصاب":[{"id":"ne001","name":"السكتة الدماغية","en":"Stroke","symptoms":"شلل نصفي، اضطراب كلام، انحراف فم","severity":"طارئ","tests":"CT أو MRI دماغ فوري","treatments":"tPA في 4.5 ساعة، إزالة جلطة"},{"id":"ne002","name":"الصداع النصفي","en":"Migraine","symptoms":"صداع نابض أحادي، غثيان، حساسية ضوء","severity":"خفيف","tests":"سريري، MRI إذا لزم","treatments":"تريبتان، مضادات غثيان"},{"id":"ne003","name":"الصرع","en":"Epilepsy","symptoms":"نوبات تشنج، فقدان وعي متكرر","severity":"متوسط","tests":"EEG، MRI دماغ","treatments":"فالبروات، كاربامازيبين"},{"id":"ne004","name":"الشلل الرعاشي","en":"Parkinson's Disease","symptoms":"رعشة راحة، صلابة عضلية، بطء حركة","severity":"مزمن","tests":"سريري، DaTscan","treatments":"ليفودوبا، دوبامين أجونيست"},{"id":"ne005","name":"التصلب المتعدد","en":"Multiple Sclerosis","symptoms":"ضعف، تنميل، اضطراب رؤية، إرهاق","severity":"مزمن","tests":"MRI دماغ ونخاع، سائل نخاعي","treatments":"إنترفيرون بيتا، ناتاليزوماب"},{"id":"ne006","name":"الزهايمر","en":"Alzheimer's Disease","symptoms":"فقدان ذاكرة تدريجي، تشوش","severity":"مزمن","tests":"MMSE، MRI","treatments":"دونيبيزيل، ميمانتين"},{"id":"ne007","name":"نزيف تحت العنكبوتية","en":"Subarachnoid Hemorrhage","symptoms":"صداع رعد صاعقة مفاجئ، تيبس رقبة","severity":"طارئ","tests":"CT طارئ، بزل نخاعي","treatments":"جراحة، كوبلات"},{"id":"ne008","name":"التهاب السحايا","en":"Meningitis","symptoms":"صداع، حمى، تيبس رقبة، طفح","severity":"طارئ","tests":"بزل نخاعي، كالتشر","treatments":"مضادات حيوية وريدية طارئة"},{"id":"ne009","name":"ورم دماغي","en":"Brain Tumor","symptoms":"صداع متصاعد، نوبات، ضعف بؤري","severity":"مرتفع","tests":"MRI بصبغة، خزعة","treatments":"جراحة، إشعاع، كيماوي"},{"id":"ne010","name":"اعتلال الأعصاب المحيطي","en":"Peripheral Neuropathy","symptoms":"تنميل، حرقان، ضعف أطراف سفلية","severity":"متوسط","tests":"EMG، NCS","treatments":"السيطرة على السبب، جابابنتين"},{"id":"ne011","name":"متلازمة النفق الرسغي","en":"Carpal Tunnel Syndrome","symptoms":"تنميل وألم يد ليلاً","severity":"خفيف","tests":"EMG، NCS","treatments":"جبيرة، حقن، جراحة"},{"id":"ne012","name":"الصداع العنقودي","en":"Cluster Headache","symptoms":"ألم حاد حول عين أحادي، احمرار عين","severity":"متوسط","tests":"سريري، MRI","treatments":"أكسجين، تريبتان أنفي"},{"id":"ne013","name":"ألم العصب ثلاثي التوائم","en":"Trigeminal Neuralgia","symptoms":"ألم صاعق وجهي مفاجئ قصير","severity":"متوسط","tests":"MRI دماغ","treatments":"كاربامازيبين، جراحة"},{"id":"ne014","name":"استسقاء الدماغ","en":"Hydrocephalus","symptoms":"صداع، غثيان، اضطراب مشية","severity":"مرتفع","tests":"CT أو MRI","treatments":"تحويلة VP shunt"},{"id":"ne015","name":"الشلل الوجهي","en":"Bell's Palsy","symptoms":"شلل نصف الوجه المفاجئ","severity":"متوسط","tests":"سريري","treatments":"بريدنيزون، أسيكلوفير"}],"جهاز هضمي":[{"id":"gi001","name":"قرحة المعدة","en":"Peptic Ulcer","symptoms":"ألم شرسوفي يزيد بالجوع أو الأكل","severity":"متوسط","tests":"منظار هضمي، هيليكوباكتر","treatments":"مثبطات PPI، مضاد حيوي H.pylori"},{"id":"gi002","name":"التهاب الزائدة","en":"Appendicitis","symptoms":"ألم سرة ينتقل يمين أسفل، حمى","severity":"طارئ","tests":"إيكو بطن، CT","treatments":"استئصال جراحي طارئ"},{"id":"gi003","name":"التهاب القولون التقرحي","en":"Ulcerative Colitis","symptoms":"إسهال دموي مزمن، تقلصات","severity":"مزمن","tests":"منظار قولوني، خزعة","treatments":"5-ASA، ستيرويد، بيولوجيك"},{"id":"gi004","name":"مرض كرون","en":"Crohn's Disease","symptoms":"إسهال، ألم بطني، فقدان وزن","severity":"مزمن","tests":"CT بطن، منظار","treatments":"ستيرويد، إيميونو، بيولوجيك"},{"id":"gi005","name":"التهاب الكبد B","en":"Hepatitis B","symptoms":"يرقان، إجهاد، ألم يمين أعلى","severity":"متوسط","tests":"HBsAg، HBV DNA","treatments":"تينوفوفير، إنترلامودين"},{"id":"gi006","name":"تليف الكبد","en":"Liver Cirrhosis","symptoms":"استسقاء، اصفرار، نزيف دوالي","severity":"مرتفع","tests":"FIB-4، إيكو كبد","treatments":"علاج مضاعفات، زرع كبد"},{"id":"gi007","name":"حصوات المرارة","en":"Gallstones","symptoms":"مغص مراري بعد دهون، غثيان","severity":"متوسط","tests":"إيكو بطن","treatments":"استئصال مرارة لابوراسكوبي"},{"id":"gi008","name":"التهاب البنكرياس الحاد","en":"Acute Pancreatitis","symptoms":"ألم شرسوفي ظهري شديد، حمى","severity":"مرتفع","tests":"أميلاز/ليباز، CT","treatments":"صيام، سوائل وريدية"},{"id":"gi009","name":"ارتداد المريء GERD","en":"GERD","symptoms":"حرقة معوية، تجشؤ، مذاق حامض","severity":"خفيف","tests":"منظار هضمي علوي","treatments":"مثبطات PPI"},{"id":"gi010","name":"سرطان القولون","en":"Colorectal Cancer","symptoms":"تغير عادات إخراج، دم براز","severity":"مرتفع","tests":"منظار قولوني، CT، CEA","treatments":"جراحة، كيماوي، إشعاع"},{"id":"gi011","name":"القولون العصبي IBS","en":"IBS","symptoms":"تقلصات، إسهال أو إمساك، انتفاخ","severity":"خفيف","tests":"تشخيص إقصائي","treatments":"تعديل نظام، مسهلات"},{"id":"gi012","name":"نزيف هضمي علوي","en":"Upper GI Bleed","symptoms":"قيء دموي، براز أسود قطراني","severity":"طارئ","tests":"منظار طارئ، Hb","treatments":"منظار علاجي، PPI وريدي"},{"id":"gi013","name":"الاستسقاء","en":"Ascites","symptoms":"تضخم بطن تدريجي، ضيق تنفس","severity":"مرتفع","tests":"إيكو، عيار بروتين","treatments":"مدرات، بزل علاجي"},{"id":"gi014","name":"التهاب الصفاق","en":"Peritonitis","symptoms":"ألم بطني منتشر، صلابة بطن، حمى","severity":"طارئ","tests":"CT بطن، CBC","treatments":"جراحة طارئة، مضادات حيوية"},{"id":"gi015","name":"انسداد معوي","en":"Intestinal Obstruction","symptoms":"ألم بطني متشنج، قيء، توقف غازات","severity":"طارئ","tests":"X-ray بطن وقوفاً، CT","treatments":"أنبوب معدي، جراحة إذا لزم"}],"صدر وتنفس":[{"id":"re001","name":"الالتهاب الرئوي","en":"Pneumonia","symptoms":"حمى، سعال بلغمي، ضيق تنفس","severity":"مرتفع","tests":"أشعة صدر، CBC، ثقافة بلغم","treatments":"مضادات حيوية، دعم تنفسي"},{"id":"re002","name":"الربو","en":"Asthma","symptoms":"ضيق تنفس انتيابي، صفير، سعال ليلي","severity":"متوسط","tests":"قياس وظائف رئة","treatments":"موسع قصبي، ستيرويد استنشاقي"},{"id":"re003","name":"الانسداد الرئوي المزمن COPD","en":"COPD","symptoms":"ضيق تنفس مزمن، سعال بلغم","severity":"مزمن","tests":"وظائف رئة، غازات دموية","treatments":"برونكوديلاتور، أكسجين"},{"id":"re004","name":"سرطان الرئة","en":"Lung Cancer","symptoms":"سعال مزمن، نفث دم، فقدان وزن","severity":"مرتفع","tests":"CT صدر، PET scan، خزعة","treatments":"جراحة، كيماوي، مناعة"},{"id":"re005","name":"انصباب جنبي","en":"Pleural Effusion","symptoms":"ضيق تنفس، ألم جنبي","severity":"متوسط","tests":"إيكو جنب، أشعة صدر","treatments":"بزل جنبي، علاج السبب"},{"id":"re006","name":"استرواح الصدر","en":"Pneumothorax","symptoms":"ألم صدري مفاجئ، ضيق تنفس","severity":"مرتفع","tests":"أشعة صدر","treatments":"صرف هواء، تيوب"},{"id":"re007","name":"سل الرئة","en":"Pulmonary TB","symptoms":"سعال 3 أسابيع، نفث دم، تعرق ليلي","severity":"مرتفع","tests":"تحليل بلغم BK، X-ray","treatments":"RHEZ 6 أشهر"},{"id":"re008","name":"ARDS","en":"ARDS","symptoms":"ضيق تنفس حاد، نقص أكسجين","severity":"طارئ","tests":"غازات دموية، X-ray أبيض","treatments":"تهوية حامية، وضع بطني"},{"id":"re009","name":"انسداد مجرى هوائي","en":"Airway Obstruction","symptoms":"ضيق تنفس مفاجئ، صرير، زرقة","severity":"طارئ","tests":"سريري","treatments":"هايمليك، بضع حلقوم"},{"id":"re010","name":"ذات الجنب","en":"Pleuritis","symptoms":"ألم صدري يزداد مع التنفس","severity":"متوسط","tests":"أشعة صدر، إيكو","treatments":"NSAIDs، علاج السبب"},{"id":"re011","name":"السعال الديكي","en":"Whooping Cough","symptoms":"نوبات سعال شديدة مع صرير شهيقي","severity":"متوسط","tests":"كالتشر مسحة أنف، PCR","treatments":"أزيثروميسين"},{"id":"re012","name":"التهاب الشعب الهوائية","en":"Bronchitis","symptoms":"سعال مع بلغم، حمى خفيفة","severity":"خفيف","tests":"سريري","treatments":"مسكنات، مضاد حيوي إذا جرثومي"},{"id":"re013","name":"ارتفاع ضغط رئوي","en":"Pulmonary Hypertension","symptoms":"ضيق تنفس مع مجهود، إجهاد","severity":"مرتفع","tests":"إيكو، قسطرة قلب يمين","treatments":"بوسينتان، سيلدينافيل"},{"id":"re014","name":"نوبات انقطاع نفس نوم","en":"Sleep Apnea","symptoms":"شخير، توقف تنفس ليلي، نعاس نهاري","severity":"متوسط","tests":"دراسة نوم","treatments":"CPAP، تخسيس، جراحة"},{"id":"re015","name":"أنفلونزا موسمية","en":"Influenza","symptoms":"حمى مفاجئة، صداع، آلام عضلية، سعال","severity":"خفيف","tests":"سريري، مسحة أنف سريعة","treatments":"تاميفلو، راحة، سوائل"}],"كلى وبول":[{"id":"ur001","name":"التهاب المسالك البولية","en":"UTI","symptoms":"حرقان تبول، تكرار، ألم أسفل بطن","severity":"خفيف","tests":"تحليل بول، كالتشر","treatments":"مضادات حيوية 3-7 أيام"},{"id":"ur002","name":"حصوات الكلى","en":"Kidney Stones","symptoms":"مغص كلوي شديد، دم في البول","severity":"متوسط","tests":"CT بدون صبغة، إيكو","treatments":"مسكنات، تفتيت بموجات"},{"id":"ur003","name":"التهاب الحوض الكلوي","en":"Pyelonephritis","symptoms":"حمى، قشعريرة، ألم ظهري","severity":"مرتفع","tests":"تحليل بول، كالتشر","treatments":"مضادات حيوية وريدية"},{"id":"ur004","name":"الفشل الكلوي الحاد","en":"Acute Kidney Injury","symptoms":"قلة بول، تورم، غثيان","severity":"طارئ","tests":"كرياتينين، BUN","treatments":"توقف السبب، غسيل كلوي"},{"id":"ur005","name":"الفشل الكلوي المزمن","en":"CKD","symptoms":"إجهاد، فقر دم، تورم","severity":"مزمن","tests":"GFR، كرياتينين","treatments":"السيطرة على ضغط وسكر، غسيل"},{"id":"ur006","name":"المتلازمة الكلائية","en":"Nephrotic Syndrome","symptoms":"تورم شديد، بروتين في البول","severity":"مرتفع","tests":"بروتين 24 ساعة، خزعة كلى","treatments":"ستيرويدات، مثبطات مناعة"},{"id":"ur007","name":"سرطان المثانة","en":"Bladder Cancer","symptoms":"دم في البول بدون ألم","severity":"مرتفع","tests":"منظار مثانة، CT","treatments":"استئصال منظاري، كيماوي"},{"id":"ur008","name":"تضخم البروستاتا البسيط","en":"BPH","symptoms":"صعوبة تبول، تكرار ليلي","severity":"خفيف","tests":"PSA، إيكو مثانة","treatments":"ألفا حاصرات، TURP"},{"id":"ur009","name":"التهاب البروستاتا","en":"Prostatitis","symptoms":"ألم عجاني، حرقان تبول، حمى","severity":"متوسط","tests":"تحليل بول، إيكو","treatments":"مضادات حيوية طويلة"},{"id":"ur010","name":"التهاب كبيبات الكلى","en":"Glomerulonephritis","symptoms":"دم بول، بروتين بول، ارتفاع ضغط","severity":"مرتفع","tests":"خزعة كلى، مناعية","treatments":"ستيرويدات، مثبطات مناعة"},{"id":"ur011","name":"المثانة العصبية","en":"Neurogenic Bladder","symptoms":"احتباس أو تسرب بول، تكرار","severity":"متوسط","tests":"تنظير ديناميكي مثانة","treatments":"قسطرة متقطعة، أوكسيبيوتينين"},{"id":"ur012","name":"سرطان الكلى","en":"Renal Cell Carcinoma","symptoms":"دم بول، كتلة خاصرة، حمى","severity":"مرتفع","tests":"CT بطن، خزعة","treatments":"استئصال جراحي، سورافينيب"}],"الغدد الصماء":[{"id":"en001","name":"داء السكري النوع 2","en":"Type 2 Diabetes","symptoms":"عطش، كثرة تبول، إجهاد","severity":"مزمن","tests":"سكر صيام، HbA1c","treatments":"ميتفورمين، GLP-1، أنسولين"},{"id":"en002","name":"داء السكري النوع 1","en":"Type 1 Diabetes","symptoms":"عطش شديد، كثرة تبول، فقدان وزن","severity":"مزمن","tests":"سكر، C-peptide، أجسام مضادة","treatments":"أنسولين مدى الحياة"},{"id":"en003","name":"الحماض الكيتوني السكري","en":"DKA","symptoms":"غثيان، قيء، نفس مفروني","severity":"طارئ","tests":"سكر، غازات دموية، كيتون","treatments":"سوائل وريدية، أنسولين وريدي"},{"id":"en004","name":"قصور الغدة الدرقية","en":"Hypothyroidism","symptoms":"إجهاد، زيادة وزن، إمساك","severity":"مزمن","tests":"TSH، T4 حر","treatments":"ليفوثيروكسين"},{"id":"en005","name":"فرط الغدة الدرقية","en":"Hyperthyroidism","symptoms":"نحافة، خفقان، رعشة، تعرق","severity":"متوسط","tests":"TSH، T3/T4","treatments":"كاربيمازول، يود مشع"},{"id":"en006","name":"متلازمة كوشينج","en":"Cushing's Syndrome","symptoms":"سمنة جذعية، وجه قمري","severity":"مرتفع","tests":"كورتيزول 24 ساعة","treatments":"استئصال الورم"},{"id":"en007","name":"قصور الغدة الكظرية","en":"Addison's Disease","symptoms":"إجهاد، انخفاض ضغط، ظلام جلد","severity":"مرتفع","tests":"كورتيزول، ACTH","treatments":"هيدروكورتيزون + فلودروكورتيزون"},{"id":"en008","name":"ورم القواتم","en":"Pheochromocytoma","symptoms":"ارتفاع ضغط انتيابي، صداع، تعرق","severity":"مرتفع","tests":"ميتانيفرين بول، CT","treatments":"استئصال جراحي"},{"id":"en009","name":"ضخامة النهايات","en":"Acromegaly","symptoms":"تضخم اليدين والقدمين","severity":"مزمن","tests":"GH، IGF-1، MRI نخامي","treatments":"استئصال نخامي، أوكتريوتيد"},{"id":"en010","name":"نقص كالسيوم الدم","en":"Hypocalcemia","symptoms":"تشنج عضلي، تنميل حول فم","severity":"متوسط","tests":"كالسيوم، PTH","treatments":"كالسيوم وريدي، فيتامين D"},{"id":"en011","name":"أزمة الغدة الدرقية","en":"Thyroid Storm","symptoms":"حمى شديدة، خفقان، ارتباك، تعرق غزير","severity":"طارئ","tests":"TSH، T3/T4، ECG","treatments":"بروبيلثيوراسيل، بروبرانولول، ديكسا"},{"id":"en012","name":"السمنة المرضية","en":"Morbid Obesity","symptoms":"BMI فوق 40، ضيق تنفس، آلام مفاصل","severity":"مزمن","tests":"BMI، سكر، ضغط، دهون","treatments":"تعديل نظام، GLP-1، جراحة بالمنظار"}],"عظام ومفاصل":[{"id":"rh001","name":"التهاب المفاصل الروماتويدي","en":"Rheumatoid Arthritis","symptoms":"ألم مفاصل صغيرة متماثل، صباحي","severity":"مزمن","tests":"RF، Anti-CCP","treatments":"ميثوتريكسات، بيولوجيك"},{"id":"rh002","name":"النقرس","en":"Gout","symptoms":"ألم حاد مفاجئ في إبهام القدم","severity":"متوسط","tests":"حمض يوريك، سائل مفصلي","treatments":"كولشيسين، NSAIDs، ألوبيورينول"},{"id":"rh003","name":"هشاشة العظام","en":"Osteoporosis","symptoms":"كسور مع إصابات بسيطة","severity":"مزمن","tests":"DXA scan","treatments":"بيسفوسفونات، D3، كالسيوم"},{"id":"rh004","name":"خشونة ركبة","en":"Knee Osteoarthritis","symptoms":"ألم مزمن ركبة، تيبس صباحي","severity":"مزمن","tests":"X-ray مفصل","treatments":"فيزيوثيرابي، حقن مفصلية"},{"id":"rh005","name":"الذئبة الحمراء","en":"SLE","symptoms":"طفح فراشة، ألم مفاصل، إجهاد","severity":"مرتفع","tests":"ANA، Anti-dsDNA","treatments":"هيدروكسيكلوروكين، ستيرويدات"},{"id":"rh006","name":"التهاب الفقار اللاصق","en":"Ankylosing Spondylitis","symptoms":"ألم ظهر مزمن في الشباب يخف بالحركة","severity":"مزمن","tests":"HLA-B27، MRI عجز","treatments":"NSAIDs، بيولوجيك TNF"},{"id":"rh007","name":"كسر عنق الفخذ","en":"Hip Fracture","symptoms":"ألم ورك حاد، قصر قدم بعد سقوط","severity":"طارئ","tests":"X-ray حوض","treatments":"جراحة طارئة"},{"id":"rh008","name":"انزلاق غضروفي","en":"Disc Herniation","symptoms":"ألم ظهر يمتد للساق، تنميل قدم","severity":"متوسط","tests":"MRI عمود فقري","treatments":"مسكنات، فيزيو، جراحة"},{"id":"rh009","name":"تضيق القناة الشوكية","en":"Spinal Stenosis","symptoms":"ألم ساقين عند المشي يتحسن بالانحناء","severity":"متوسط","tests":"MRI عمود فقري","treatments":"فيزيو، حقن، جراحة"},{"id":"rh010","name":"التهاب المفصل الإنتاني","en":"Septic Arthritis","symptoms":"مفصل أحمر ساخن منتفخ مع حمى","severity":"طارئ","tests":"سائل مفصلي، كالتشر","treatments":"مضادات حيوية، صرف مفصل"},{"id":"rh011","name":"ألم العضلات الليفي","en":"Fibromyalgia","symptoms":"آلام عضلية منتشرة، إجهاد، اضطراب نوم","severity":"مزمن","tests":"تشخيص إقصائي","treatments":"دولوكسيتين، فيزيوثيرابي، CBT"},{"id":"rh012","name":"التهاب الأوتار","en":"Tendinitis","symptoms":"ألم وتر مع الحركة، تورم موضعي","severity":"خفيف","tests":"إيكو وتر","treatments":"راحة، NSAIDs، فيزيو"}],"جلدية":[{"id":"dr001","name":"الصدفية","en":"Psoriasis","symptoms":"لويحات حرشفية حمراء، حكة","severity":"مزمن","tests":"خزعة جلدية","treatments":"ستيرويد موضعي، بيولوجيك"},{"id":"dr002","name":"التهاب جلدي تأتبي","en":"Atopic Dermatitis","symptoms":"حكة شديدة، جفاف، احمرار","severity":"مزمن","tests":"IgE","treatments":"مرطبات، ستيرويد موضعي"},{"id":"dr003","name":"حب الشباب","en":"Acne Vulgaris","symptoms":"حبوب التهابية وجه وظهر","severity":"خفيف","tests":"سريري","treatments":"بنزويل بيروكسيد، ريتينويد"},{"id":"dr004","name":"الشرى","en":"Urticaria","symptoms":"كتل حمراء مثيرة للحكة","severity":"متوسط","tests":"IgE، تحريات حساسية","treatments":"مضادات هيستامين"},{"id":"dr005","name":"سرطان الجلد الميلانيني","en":"Melanoma","symptoms":"وحمة متغيرة غير منتظمة","severity":"مرتفع","tests":"خزعة جلدية","treatments":"استئصال، مناعة"},{"id":"dr006","name":"الهربس النطاقي","en":"Herpes Zoster","symptoms":"ألم حرقان ثم طفح أحادي","severity":"متوسط","tests":"سريري","treatments":"أسيكلوفير، مسكنات عصبية"},{"id":"dr007","name":"الجرب","en":"Scabies","symptoms":"حكة شديدة ليلية","severity":"خفيف","tests":"مجهر قشور جلدية","treatments":"بيرميثرين 5%"},{"id":"dr008","name":"التهاب النسيج الخلوي","en":"Cellulitis","symptoms":"احمرار دافئ منتشر مع حمى","severity":"متوسط","tests":"CBC، كالتشر","treatments":"مضادات حيوية"},{"id":"dr009","name":"التساقط الحلقي","en":"Alopecia Areata","symptoms":"تساقط شعر بأماكن دائرية","severity":"خفيف","tests":"سريري، TSH","treatments":"ستيرويد موضعي"},{"id":"dr010","name":"فطريات الجلد","en":"Tinea","symptoms":"حكة دائرية حرشفية، تغير لون أظافر","severity":"خفيف","tests":"فحص مجهري","treatments":"مضاد فطريات موضعي أو فموي"}],"عيون":[{"id":"ey001","name":"الجلوكوما","en":"Glaucoma","symptoms":"فقدان رؤية محيطي، ضغط عين مرتفع","severity":"مزمن","tests":"ضغط عين، OCT","treatments":"قطرات خافضة ضغط، جراحة"},{"id":"ey002","name":"الماء البيضاء","en":"Cataract","symptoms":"ضبابية رؤية تدريجية، وهج","severity":"مزمن","tests":"فحص مصباح شق","treatments":"استئصال جراحي مع عدسة"},{"id":"ey003","name":"التنكس البقعي","en":"Macular Degeneration","symptoms":"ضبابية مركزية، خطوط معوجة","severity":"مزمن","tests":"OCT، FAG","treatments":"حقن anti-VEGF"},{"id":"ey004","name":"انفصال الشبكية","en":"Retinal Detachment","symptoms":"ومضات ضوء، ستارة رؤية مفاجئة","severity":"طارئ","tests":"فحص قاع العين","treatments":"جراحة طارئة"},{"id":"ey005","name":"التهاب الملتحمة","en":"Conjunctivitis","symptoms":"احمرار عين، إفراز، حكة","severity":"خفيف","tests":"سريري","treatments":"مضاد حيوي قطرة"},{"id":"ey006","name":"التهاب القرنية","en":"Keratitis","symptoms":"ألم شديد عين، رهاب ضوء","severity":"مرتفع","tests":"مصباح شق، مسحة","treatments":"مضاد حيوي مكثف"},{"id":"ey007","name":"قصر النظر","en":"Myopia","symptoms":"ضبابية رؤية البعيد","severity":"خفيف","tests":"قياس انكسار","treatments":"نظارة، LASIK"},{"id":"ey008","name":"التهاب عنبية","en":"Uveitis","symptoms":"ألم عين، احمرار، ضبابية","severity":"مرتفع","tests":"مصباح شق، مناعية","treatments":"ستيرويد قطرة وفموي"}],"أذن وأنف وحنجرة":[{"id":"ent001","name":"التهاب الأذن الوسطى","en":"Otitis Media","symptoms":"ألم أذن، حمى، ضعف سمع","severity":"متوسط","tests":"تنظير أذن","treatments":"مضادات حيوية"},{"id":"ent002","name":"ضعف السمع الحسي","en":"Sensorineural Hearing Loss","symptoms":"ضعف سمع تدريجي، طنين","severity":"مزمن","tests":"قياس سمع، ABR","treatments":"سماعة سمع، قوقعة"},{"id":"ent003","name":"دوار مينيير","en":"Meniere's Disease","symptoms":"دوار متعقب، طنين، امتلاء أذن","severity":"متوسط","tests":"قياس سمع، ENG","treatments":"مدرات، حمية ملح قليل"},{"id":"ent004","name":"التهاب الجيوب","en":"Sinusitis","symptoms":"ضغط وجه، سيلان أنف، صداع","severity":"خفيف","tests":"CT جيوب","treatments":"مضادات حيوية، بخاخ أنفي"},{"id":"ent005","name":"سرطان الحنجرة","en":"Laryngeal Cancer","symptoms":"بحة صوت مزمنة، صعوبة بلع","severity":"مرتفع","tests":"منظار حنجرة، CT، خزعة","treatments":"جراحة، إشعاع"},{"id":"ent006","name":"الدوخة الوضعية BPPV","en":"BPPV","symptoms":"دوخة قصيرة مع تغير وضع الرأس","severity":"خفيف","tests":"Dix-Hallpike","treatments":"مناورات Epley"},{"id":"ent007","name":"زوائد أنفية","en":"Nasal Polyps","symptoms":"انسداد أنفي مزمن، فقدان شم","severity":"خفيف","tests":"منظار أنف، CT","treatments":"بخاخ ستيرويد، جراحة FESS"},{"id":"ent008","name":"نزيف الأنف","en":"Epistaxis","symptoms":"نزيف أنفي متكرر أو شديد","severity":"متوسط","tests":"BP، INR","treatments":"ضغط، كي، حشو أنفي"},{"id":"ent009","name":"بحة الصوت المزمنة","en":"Chronic Dysphonia","symptoms":"تغير مزمن في جودة الصوت","severity":"خفيف","tests":"منظار حنجرة","treatments":"علاج صوت، جراحة إذا لزم"}],"نفسية":[{"id":"ps001","name":"الاكتئاب الشديد","en":"Major Depression","symptoms":"حزن مستمر، فقدان متعة، اضطراب نوم","severity":"مرتفع","tests":"PHQ-9، تقييم إكلينيكي","treatments":"SSRI، علاج معرفي سلوكي"},{"id":"ps002","name":"اضطراب ثنائي القطب","en":"Bipolar Disorder","symptoms":"نوبات اكتئاب واندفاع متبادلة","severity":"مرتفع","tests":"تقييم نفسي","treatments":"ليثيوم، فالبروات"},{"id":"ps003","name":"الفصام","en":"Schizophrenia","symptoms":"هلاسات، أوهام، كلام غير منظم","severity":"مرتفع","tests":"تقييم نفسي، استبعاد عضوي","treatments":"مضادات ذهان أتيبيكال"},{"id":"ps004","name":"اضطراب القلق العام","en":"GAD","symptoms":"قلق مفرط مستمر، توتر، أرق","severity":"متوسط","tests":"GAD-7","treatments":"SSRI، علاج سلوكي معرفي"},{"id":"ps005","name":"اضطراب ما بعد الصدمة","en":"PTSD","symptoms":"ذكريات انتكاسية، كوابيس، تجنب","severity":"مرتفع","tests":"PCL-5","treatments":"علاج تعرض، سيرترالين"},{"id":"ps006","name":"الوسواس القهري","en":"OCD","symptoms":"أفكار متسلطة وتصرفات قهرية","severity":"متوسط","tests":"Y-BOCS","treatments":"SSRI جرعة عالية، ERP"},{"id":"ps007","name":"فرط الحركة ADHD","en":"ADHD","symptoms":"قصور انتباه، اندفاع، فرط نشاط","severity":"متوسط","tests":"مقاييس ADHD","treatments":"ميثيلفينيديت، أتوموكسيتين"},{"id":"ps008","name":"إدمان","en":"Substance Use Disorder","symptoms":"اعتماد على مادة، انسحاب مع الإيقاف","severity":"مرتفع","tests":"AUDIT/DAST، وظائف كبد","treatments":"ديتوكسيفيكيشن، CBT"},{"id":"ps009","name":"اضطراب النوم","en":"Insomnia","symptoms":"صعوبة نوم أو الاستمرار فيه","severity":"خفيف","tests":"مقاييس نوم","treatments":"CBT-I، ميلاتونين، دواء إذا لزم"},{"id":"ps010","name":"القلق الاجتماعي","en":"Social Anxiety","symptoms":"خوف شديد من مواقف اجتماعية","severity":"متوسط","tests":"LSAS، تقييم إكلينيكي","treatments":"SSRI، علاج تعرض"}],"نساء وتوليد":[{"id":"ob001","name":"تسمم الحمل","en":"Preeclampsia","symptoms":"ارتفاع ضغط + بروتين بول + صداع","severity":"طارئ","tests":"BP، بروتين بول، وظائف كبد","treatments":"مغنيسيوم، خفض ضغط، تسريع ولادة"},{"id":"ob002","name":"حمل خارج الرحم","en":"Ectopic Pregnancy","symptoms":"ألم بطن + نزيف + إيجابي الحمل","severity":"طارئ","tests":"بيتا HCG، إيكو مهبلي","treatments":"ميثوتريكسات أو جراحة طارئة"},{"id":"ob003","name":"الإجهاض التلقائي","en":"Spontaneous Abortion","symptoms":"نزيف مهبلي، ألم تشنجي","severity":"متوسط","tests":"إيكو مهبلي، HCG","treatments":"تتبع أو تفريغ حسب نوع"},{"id":"ob004","name":"تكيسات المبيض PCOS","en":"PCOS","symptoms":"عدم انتظام دورة، شعر زائد","severity":"مزمن","tests":"هرمونات، إيكو مبيضين","treatments":"ميتفورمين، حبوب منع"},{"id":"ob005","name":"بطانة رحم مهاجرة","en":"Endometriosis","symptoms":"ألم شديد مع الدورة، عقم","severity":"مزمن","tests":"تنظير بطن، CA-125","treatments":"هرمونات، جراحة"},{"id":"ob006","name":"سرطان عنق الرحم","en":"Cervical Cancer","symptoms":"نزيف ما بين الدورات","severity":"مرتفع","tests":"باب سمير، HPV، خزعة","treatments":"جراحة، إشعاع، كيماوي"},{"id":"ob007","name":"سرطان الثدي","en":"Breast Cancer","symptoms":"كتلة صلبة، تغير حلمة","severity":"مرتفع","tests":"ماموجراف، إيكو، خزعة","treatments":"جراحة، كيماوي، هرمونات"},{"id":"ob008","name":"التهاب الحوض PID","en":"PID","symptoms":"ألم بطن سفلي، حمى، إفرازات","severity":"مرتفع","tests":"مسحة مهبلية، CRP","treatments":"مضادات حيوية مزدوجة"},{"id":"ob009","name":"نزيف ما بعد الولادة","en":"Postpartum Hemorrhage","symptoms":"نزيف شديد بعد الوضع","severity":"طارئ","tests":"قياس نزيف، Hb","treatments":"أوكسيتوسين، جراحة"},{"id":"ob010","name":"اكتئاب ما بعد الولادة","en":"Postpartum Depression","symptoms":"حزن، قلق، عدم رعاية طفل","severity":"مرتفع","tests":"Edinburgh Scale","treatments":"SSRI آمن للرضاعة"}],"أطفال وحديثو الولادة":[{"id":"pe001","name":"الإسهال الحاد","en":"Acute Diarrhea","symptoms":"براز مائي متكرر، قيء، حمى","severity":"متوسط","tests":"تحليل براز، كهارل","treatments":"محلول ORS، ترطيب وريدي"},{"id":"pe002","name":"تشنجات حرارية","en":"Febrile Seizures","symptoms":"تشنجات مع ارتفاع حرارة مفاجئ","severity":"متوسط","tests":"سريري، استبعاد سحايا","treatments":"ديازيبام، خفض حرارة"},{"id":"pe003","name":"خناق الأطفال","en":"Croup","symptoms":"سعال ينبح، صرير شهيق","severity":"متوسط","tests":"سريري، X-ray رقبة","treatments":"أدرينالين نيبيولايزر، ديكسا"},{"id":"pe004","name":"اليرقان الوليدي","en":"Neonatal Jaundice","symptoms":"اصفرار جلد الرضيع","severity":"متوسط","tests":"بيليروبين دم","treatments":"فوتوثيرابي"},{"id":"pe005","name":"التهاب السحايا عند الأطفال","en":"Pediatric Meningitis","symptoms":"حمى، قيء، تيبس رقبة، طفح","severity":"طارئ","tests":"بزل نخاعي طارئ","treatments":"مضادات حيوية وريدية طارئة"},{"id":"pe006","name":"الربو الطفلي","en":"Childhood Asthma","symptoms":"صفير، ضيق تنفس، سعال ليلي","severity":"مزمن","tests":"قياس وظائف رئة","treatments":"موسع قصبي، بودرة استنشاقية"},{"id":"pe007","name":"التأخر في النمو","en":"Developmental Delay","symptoms":"تأخر مراحل حركية أو كلامية","severity":"متوسط","tests":"تقييم نمو معياري","treatments":"تدخل مبكر، علاج وظيفي"},{"id":"pe008","name":"ابيضاض الدم الليمفاوي ALL","en":"ALL","symptoms":"شحوب، نزيف لثة، تضخم عقد","severity":"طارئ","tests":"CBC، نخاع عظم","treatments":"كيماوي متعدد بروتوكول BFM"},{"id":"pe009","name":"داء الفينيل كيتونيوريا PKU","en":"PKU","symptoms":"تأخر عقلي إذا لم يعالج مبكراً","severity":"مزمن","tests":"تشخيص نيوناتل فحص كعب","treatments":"نظام غذاء خالٍ من فينيل ألانين"},{"id":"pe010","name":"الفتق الإربي","en":"Inguinal Hernia","symptoms":"انتفاخ في منطقة الفخذ","severity":"خفيف","tests":"سريري، إيكو","treatments":"إصلاح جراحي اختياري"}]};

var SEVERITY_CONFIG = {
    'طارئ':   {color:'#ef4444', bg:'rgba(239,68,68,.12)', label:{en:'Emergency', fr:'Urgence', es:'Urgencia', de:'Notfall', zh:'紧急', it:'Emergenza'}},
    'مرتفع':  {color:'#f97316', bg:'rgba(249,115,22,.12)', label:{en:'High', fr:'Elevé', es:'Alto', de:'Hoch', zh:'高', it:'Alto'}},
    'متوسط':  {color:'#f59e0b', bg:'rgba(245,158,11,.12)', label:{en:'Moderate', fr:'Modéré', es:'Moderado', de:'Mittel', zh:'中等', it:'Moderato'}},
    'خفيف':   {color:'#22c55e', bg:'rgba(34,197,94,.12)', label:{en:'Mild', fr:'Léger', es:'Leve', de:'Leicht', zh:'轻度', it:'Lieve'}},
    'مزمن':   {color:'#3b82f6', bg:'rgba(59,130,246,.12)', label:{en:'Chronic', fr:'Chronique', es:'Crónico', de:'Chronisch', zh:'慢性', it:'Cronico'}},
};


/* ── Category icons map ── */
var CAT_ICONS = {
    'Kitchen Finds':          'fas fa-utensils',
    'Home Finds':             'fas fa-home',
    'آثاث':                   'fas fa-couch',
    'إلكترونيات':              'fas fa-laptop',
    'اكسسوارات إلكترونيات':   'fas fa-plug',
    'صحة وتجميل':              'fas fa-heart',
    'ملابس رجالي':             'fas fa-tshirt',
    'ملابس حريمي':             'fas fa-female',
    'ملابس أطفال بناتي':       'fas fa-child',
    'ملابس أطفال ولادي':       'fas fa-child',
    'ساعات':                   'fas fa-clock',
    'مجوهرات وإكسسوارات':     'fas fa-gem',
    'حقائب':                   'fas fa-shopping-bag',
    'طبي ودواء':               'fas fa-pills',
};
function getCatIcon(cat) {
    return CAT_ICONS[cat] || 'fas fa-tag';
}

function resetCategoriesToDefault() {
    if (!confirm('سيتم استبدال الأقسام الحالية بالأقسام الافتراضية. هل تريد المتابعة؟')) return;
    db.categories = [
        "Kitchen Finds","Home Finds","آثاث",
        "إلكترونيات","اكسسوارات إلكترونيات",
        "صحة وتجميل",
        "ملابس رجالي","ملابس حريمي","ملابس أطفال بناتي","ملابس أطفال ولادي",
        "ساعات","مجوهرات وإكسسوارات","حقائب",
        "طبي ودواء"
    ];
    saveDb();
    if (typeof updateAdminUI === 'function') updateAdminUI();
    showToast('✅ تم استعادة الأقسام الافتراضية (14 قسم)');
}

function moveCategoryUp(idx) {
    if (!db.categories || idx <= 0) return;
    var tmp = db.categories[idx-1];
    db.categories[idx-1] = db.categories[idx];
    db.categories[idx] = tmp;
    saveDb();
    if (typeof updateAdminUI === 'function') updateAdminUI();
}

function moveCategoryDown(idx) {
    if (!db.categories || idx >= db.categories.length-1) return;
    var tmp = db.categories[idx+1];
    db.categories[idx+1] = db.categories[idx];
    db.categories[idx] = tmp;
    saveDb();
    if (typeof updateAdminUI === 'function') updateAdminUI();
}

window.onload = function() {
    // Failsafe: force-hide loader after 3s no matter what
    setTimeout(function(){ _forceHideLoader(); }, 3000);
    initDarkMode();
    loadDb();
    // Check if URL is a direct product link (/product/slug)
    if (typeof _checkProductURL === 'function') {
        if (_checkProductURL()) return; // URL matched, stop normal init
    }
    setTimeout(initPWA, 1000);
    setTimeout(initStripe, 500);
    // Quick restore user display from cache (before Firebase loads)
    var cachedUser = localStorage.getItem('marassia_user_display');
    if (cachedUser) { currentUser = cachedUser; checkUserLogin(); }
    // Restore cart from localStorage
    try {
        var savedCart = localStorage.getItem('marassia_cart');
        if (savedCart) {
            var parsed = JSON.parse(savedCart);
            if (Array.isArray(parsed)) shoppingCart = parsed;
        }
    } catch(e){}
    initCurrency();
    initializeApp();
    // Show biometric login if registered
    if (localStorage.getItem('marassia_bio_id')) {
        var b=document.getElementById('admin-bio-use-btn'); if(b) b.style.display='flex';
    }
    setTimeout(initHeroCanvas, 400);
    applyLegalPages();
    applyIntroOnLoad();
    checkApiStatus();
    // Firebase deferred — retry until available
    var _fbTries = 0;
    function _tryFb() {
        if (typeof firebase !== 'undefined') {
            setTimeout(_startFirebaseSync, 100);
        } else if (_fbTries++ < 40) {
            setTimeout(_tryFb, 150);
        }
    }
    setTimeout(_tryFb, 100);
};



/* ═════════════════════════════════════════════════════════
   MARASSiA v2 — Extended Features
   1. _closeModal helper
   2. Blog & Product SEO Generator
   3. Product URL System
   4. Product Comparison System
   5. Crossroads Homepage
   6. Category Journey Buttons
════════════════════════════════════════════════════════ */

/* ── Modal helper ─────────────────────────────────────── */
function _closeModal(id){ var el=document.getElementById(id); if(el) el.style.display='none'; }

/* ── SEO Generators ───────────────────────────────────── */
async function generateBlogSEO(){
    var title=(document.getElementById('b-title')||{}).value||'';
    var desc=(document.getElementById('b-desc')||{}).value||'';
    if((title+desc).trim().length<20){showToast('أكتب العنوان والوصف أولاً','error');return;}
    var btn=document.getElementById('seo-gen-btn');
    if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> جارٍ التحليل...';}
    try{
        var r=await _apiFetch({model:'claude-sonnet-4-20250514',max_tokens:600,messages:[{role:'user',content:'خبير SEO. حلل هذا المحتوى وأنتج JSON فقط:\n{"seoTitle":"","metaDesc":"","slug":"","keywords":"","readTime":""}\n\nالعنوان: '+title+'\nالمحتوى: '+desc}]});
        var d=await r.json();
        var blk=(d.content||[]).find(function(b){return b.type==='text';});
        var seo=JSON.parse(blk.text.replace(/```json|```/g,'').trim());
        [['b-seo-title','seoTitle'],['b-seo-desc','metaDesc'],['b-seo-slug','slug'],['b-seo-keywords','keywords'],['b-read-time','readTime']].forEach(function(pair){
            var el=document.getElementById(pair[0]); if(el&&seo[pair[1]]) el.value=seo[pair[1]];
        });
        showToast('✅ تم توليد SEO!');
    }catch(e){showToast('خطأ: '+e.message,'error');}
    finally{if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-magic"></i> توليد SEO';}}
}

async function generateProductSEO(){
    var name=(document.getElementById('p-name')||{}).value||'';
    if(!name){showToast('أدخل اسم المنتج أولاً','error');return;}
    var btn=document.getElementById('p-seo-gen-btn');
    if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';}
    try{
        var desc=(document.getElementById('p-desc')||{}).value||'';
        var cat=(document.getElementById('p-cat')||{}).value||'';
        var price=(document.getElementById('p-price')||{}).value||'';
        var r=await _apiFetch({model:'claude-sonnet-4-20250514',max_tokens:500,messages:[{role:'user',content:'خبير SEO. أنتج JSON فقط:\n{"slug":"","metaTitle":"","metaDesc":"","keywords":"","structuredDesc":""}\n\nالمنتج: '+name+'\nالوصف: '+desc+'\nالقسم: '+cat+'\nالسعر: '+price+' USD'}]});
        var d=await r.json();
        var blk=(d.content||[]).find(function(b){return b.type==='text';});
        var seo=JSON.parse(blk.text.replace(/```json|```/g,'').trim());
        [['p-slug','slug'],['p-seo-title','metaTitle'],['p-seo-desc','metaDesc'],['p-keywords','keywords']].forEach(function(pair){
            var el=document.getElementById(pair[0]); if(el&&seo[pair[1]]) el.value=seo[pair[1]];
        });
        if(seo.structuredDesc){var de=document.getElementById('p-desc'); if(de&&!de.value) de.value=seo.structuredDesc;}
        showToast('✅ SEO المنتج جاهز!');
    }catch(e){showToast('خطأ: '+e.message,'error');}
    finally{if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-magic"></i> SEO';}}
}

/* ── Product URL System ───────────────────────────────── */
function slugify(text){
    if(!text) return '';
    return text.toString().trim().replace(/\s+/g,'-').replace(/[^\u0600-\u06FFa-z0-9-]/gi,'').replace(/--+/g,'-').replace(/^-|-$/g,'').toLowerCase().substring(0,80);
}
function getProductSlug(p){
    if(!p) return '';
    if(p.slug) return p.slug;
    var name=(p.translations&&p.translations.en&&p.translations.en.name)||p.name||'';
    return slugify(name)||String(p.id);
}
function findProductBySlug(slug){
    if(!slug) return null;
    var numId=parseInt(slug,10);
    if(!isNaN(numId)){var byId=db.products.find(function(p){return p.id===numId;});if(byId) return byId;}
    var bySlug=db.products.find(function(p){return p.slug===slug;});
    if(bySlug) return bySlug;
    return db.products.find(function(p){return getProductSlug(p)===slug;})||null;
}
function navigateToProduct(idOrSlug){
    var p=typeof idOrSlug==='number'?db.products.find(function(x){return x.id===idOrSlug;}):findProductBySlug(idOrSlug);
    if(!p) return;
    var slug=getProductSlug(p);
    if(history.pushState) history.pushState({view:'product',slug:slug,id:p.id},'','/product/'+slug);
    renderProductPage(p);
}
function renderProductPage(p){
    document.querySelectorAll('.view-section').forEach(function(el){el.classList.remove('active');});
    if(!document.getElementById('view-product')){
        var sec=document.createElement('section'); sec.id='view-product'; sec.className='view-section';
        var main=document.querySelector('main'); if(main) main.appendChild(sec);
    }
    var view=document.getElementById('view-product');
    if(view) view.classList.add('active');
    _fillProductPage(p);
    window.scrollTo(0,0);
    try{localStorage.setItem('marassia_view','product');localStorage.setItem('marassia_product_id',p.id);}catch(e){}
}
function _fillProductPage(p){
    var lang=(typeof currentLang!=='undefined'?currentLang:'ar');
    var tr=(p.translations&&p.translations[lang])||{};
    var name=tr.name||p.name||'';
    var desc=tr.desc||p.desc||'';
    var priceStr=(typeof formatPrice==='function')?formatPrice(p.price):('$'+p.price);
    var waNum=(typeof db!=='undefined'&&db.settings&&db.settings.whatsapp)||'';
    var allMedia=[];
    if(p.media) allMedia.push({url:p.media,type:p.type||'img'});
    (p.images||[]).forEach(function(img){if(img&&!allMedia.find(function(m){return m.url===img;})) allMedia.push({url:img,type:'img'});});
    (p.videos||[]).forEach(function(v){if(v) allMedia.push({url:v,type:'vid'});});
    var html='<div class="product-page-wrap">';
    html+='<div class="pp-breadcrumb"><span onclick="navigate(\'home\')" style="cursor:pointer;color:var(--primary-blue)">الرئيسية</span> / <span>'+sanitize(p.category||'')+'</span> / <span>'+sanitize(name)+'</span></div>';
    html+='<div class="pp-layout">';
    html+='<div class="pp-gallery"><div class="pp-main-media" id="pp-main-media">';
    if(!allMedia.length) html+='<div class="pp-media-placeholder"><i class="fas fa-image"></i></div>';
    else if(allMedia[0].type==='vid') html+='<video src="'+sanitize(allMedia[0].url)+'" controls class="pp-media-main"></video>';
    else html+='<img src="'+sanitize(allMedia[0].url)+'" alt="'+sanitize(name)+'" class="pp-media-main" loading="lazy">';
    html+='</div>';
    if(allMedia.length>1){
        html+='<div class="pp-thumbs">';
        allMedia.forEach(function(m,i){
            html+='<div class="pp-thumb'+(i===0?' active':'')+'" onclick="ppSwitchMedia('+i+')">';
            if(m.type==='vid') html+='<div class="pp-thumb-vid"><i class="fas fa-play"></i></div>';
            else html+='<img src="'+sanitize(m.url)+'" alt="" loading="lazy">';
            html+='</div>';
        });
        html+='</div>';
    }
    if(p.vr360) html+='<div class="pp-vr-badge"><i class="fas fa-vr-cardboard"></i> 360° VR</div>';
    html+='</div>';
    html+='<div class="pp-info">';
    html+='<div class="pp-badge-row"><span class="pp-cat-badge">'+sanitize(p.category||'')+'</span>';
    if(p.salesCount>10) html+='<span class="pp-hot-badge"><i class="fas fa-fire"></i> الأكثر مبيعاً</span>';
    html+='</div>';
    html+='<h1 class="pp-title">'+sanitize(name)+'</h1>';
    html+='<div class="pp-price">'+priceStr+'</div>';
    html+='<div class="pp-desc">'+sanitize(desc)+'</div>';
    html+='<div class="pp-actions">';
    html+='<button class="pp-btn-cart" onclick="addToCart('+p.id+')"><i class="fas fa-shopping-cart"></i> أضف للسلة</button>';
    html+='<button class="pp-btn-compare" onclick="addToCompare('+p.id+')"><i class="fas fa-balance-scale"></i> قارن</button>';
    html+='</div>';
    if(waNum) html+='<a class="pp-btn-wa" href="https://wa.me/'+waNum+'?text='+encodeURIComponent('استفسار عن: '+name)+'" target="_blank"><i class="fab fa-whatsapp"></i> واتساب</a>';
    html+='</div></div>';
    var related=db.products.filter(function(x){return x.id!==p.id&&x.category===p.category;}).slice(0,4);
    if(related.length){
        html+='<div class="pp-related-section"><h3 class="pp-section-h">منتجات مشابهة</h3><div class="pp-related-grid">';
        related.forEach(function(rp){
            var rtr=(rp.translations&&rp.translations[lang])||{}; var rname=rtr.name||rp.name||'';
            html+='<div class="pp-related-card" onclick="navigateToProduct('+rp.id+')">'
                +'<img src="'+sanitize(rp.media||'')+'" alt="'+sanitize(rname)+'" loading="lazy">'
                +'<div class="pp-rel-name">'+sanitize(rname)+'</div>'
                +'<div class="pp-rel-price">'+(typeof formatPrice==='function'?formatPrice(rp.price):'$'+rp.price)+'</div>'
                +'</div>';
        });
        html+='</div></div>';
    }
    html+='</div>';
    var view=document.getElementById('view-product');
    if(view) view.innerHTML=html;
    window._ppMedia=allMedia;
    document.title=sanitize(name)+' — MARASSiA';
    var metaDesc=document.querySelector('meta[name="description"]');
    if(metaDesc) metaDesc.setAttribute('content',sanitize(desc).substring(0,155));
    if(typeof renderReviews==='function') setTimeout(function(){renderReviews(p.id);},200);
}
function ppSwitchMedia(idx){
    var m=(window._ppMedia||[])[idx]; if(!m) return;
    var c=document.getElementById('pp-main-media'); if(!c) return;
    if(m.type==='vid') c.innerHTML='<video src="'+sanitize(m.url)+'" controls class="pp-media-main"></video>';
    else c.innerHTML='<img src="'+sanitize(m.url)+'" alt="" class="pp-media-main" loading="lazy">';
    document.querySelectorAll('.pp-thumb').forEach(function(t,i){t.classList.toggle('active',i===idx);});
}
function _checkProductURL(){
    var path=location.pathname;
    var m=path.match(/\/product\/([^/?#]+)/);
    if(!m) return false;
    var slug=m[1];
    if(!db||!db.products||!db.products.length){setTimeout(_checkProductURL,300);return true;}
    var p=findProductBySlug(slug);
    if(p){renderProductPage(p);return true;}
    return false;
}

/* ── Comparison System ────────────────────────────────── */
var _compareList=[];
function addToCompare(id){
    var p=db.products.find(function(x){return x.id===id;});
    if(!p) return;
    if(_compareList.find(function(x){return x.id===id;})){showToast('موجود بالفعل','info');return;}
    if(_compareList.length>=3){showToast('3 منتجات كحد أقصى','error');return;}
    _compareList.push(p);
    _updateCompareBar();
    showToast('تم إضافة «'+(p.name||'')+'» للمقارنة');
}
function removeFromCompare(id){
    _compareList=_compareList.filter(function(x){return x.id!==id;});
    _updateCompareBar();
    if(_compareList.length<2){var m=document.getElementById('compare-modal');if(m)m.style.display='none';}
}
function _updateCompareBar(){
    var bar=document.getElementById('compare-bar');
    if(!bar){var b=document.createElement('div');b.id='compare-bar';b.className='compare-bar';b.style.transform='translateY(100%)';document.body.appendChild(b);bar=b;}
    if(!_compareList.length){bar.style.transform='translateY(100%)';return;}
    bar.style.transform='translateY(0)';
    var lang=(typeof currentLang!=='undefined'?currentLang:'ar');
    var inner='<div class="cmp-bar-inner"><span class="cmp-bar-label"><i class="fas fa-balance-scale"></i> مقارنة ('+_compareList.length+'/3)</span><div class="cmp-bar-items">';
    _compareList.forEach(function(p){var tr=(p.translations&&p.translations[lang])||{};var nm=tr.name||p.name||'';inner+='<div class="cmp-bar-item"><img src="'+sanitize(p.media||'')+'" alt="'+sanitize(nm)+'"><span>'+sanitize(nm.substring(0,18))+'</span><button onclick="removeFromCompare('+p.id+')">×</button></div>';});
    inner+='</div>';
    if(_compareList.length>=2) inner+='<button class="cmp-bar-btn" onclick="openCompareModal()"><i class="fas fa-balance-scale"></i> قارن الآن</button>';
    else inner+='<span class="cmp-bar-hint">أضف منتجاً آخر</span>';
    inner+='<button class="cmp-bar-clear" onclick="_compareList=[];_updateCompareBar()">×</button></div>';
    bar.innerHTML=inner;
}
function openCompareModal(){
    if(_compareList.length<2){showToast('أضف منتجين على الأقل','error');return;}
    var modal=document.getElementById('compare-modal');
    if(!modal){var el=document.createElement('div');el.id='compare-modal';el.className='compare-modal-overlay';el.onclick=function(e){if(e.target===el)el.style.display='none';};el.innerHTML='<div class="compare-modal-box"><button class="compare-close" onclick="_closeModal(\'compare-modal\')"><i class="fas fa-times"></i></button><div id="compare-table-wrap"></div></div>';document.body.appendChild(el);modal=document.getElementById('compare-modal');}
    modal.style.display='flex';
    _renderCompareTable();
}
function _renderCompareTable(){
    var lang=(typeof currentLang!=='undefined'?currentLang:'ar');
    var prods=_compareList;
    var wrap=document.getElementById('compare-table-wrap');
    if(!wrap) return;
    var attrs=[
        {label:'الاسم',fn:function(p){var tr=(p.translations&&p.translations[lang])||{};return tr.name||p.name||'—';}},
        {label:'السعر',fn:function(p){return typeof formatPrice==='function'?formatPrice(p.price):'$'+p.price;},cmp:'lowest'},
        {label:'القسم',fn:function(p){return p.category||'—';}},
        {label:'المبيعات',fn:function(p){return (p.salesCount||0)+' مبيعة';},cmp:'highest'},
        {label:'الوصف',fn:function(p){var tr=(p.translations&&p.translations[lang])||{};return (tr.desc||p.desc||'').substring(0,60)+'...';}},
    ];
    var html='<div class="cmp-header"><h2 class="cmp-title"><i class="fas fa-balance-scale"></i> مقارنة المنتجات</h2></div>';
    html+='<div class="cmp-table-wrap"><table class="cmp-table"><thead><tr><th class="cmp-attr-col">الميزة</th>';
    prods.forEach(function(p){var tr=(p.translations&&p.translations[lang])||{};var nm=tr.name||p.name||'';html+='<th class="cmp-prod-col"><div class="cmp-prod-hdr"><img src="'+sanitize(p.media||'')+'" alt="'+sanitize(nm)+'" class="cmp-prod-img"><div class="cmp-prod-nm">'+sanitize(nm)+'</div><button class="cmp-remove-btn" onclick="removeFromCompare('+p.id+');_renderCompareTable()">إزالة</button></div></th>';});
    html+='</tr></thead><tbody>';
    attrs.forEach(function(attr){
        html+='<tr class="cmp-row"><td class="cmp-attr-name">'+attr.label+'</td>';
        var vals=prods.map(function(p){return attr.fn(p);});
        var bestIdx=-1;
        if(attr.cmp==='lowest'){var nums=prods.map(function(p){return parseFloat(p.price)||Infinity;});bestIdx=nums.indexOf(Math.min.apply(null,nums));}
        else if(attr.cmp==='highest'){var ks=prods.map(function(p){return p.salesCount||0;});bestIdx=ks.indexOf(Math.max.apply(null,ks));}
        vals.forEach(function(v,i){html+='<td class="cmp-val'+(i===bestIdx?' cmp-best':'')+'">'+sanitize(String(v))+(i===bestIdx?'<span class="cmp-best-badge">✓</span>':'')+'</td>';});
        html+='</tr>';
    });
    html+='<tr class="cmp-row"><td class="cmp-attr-name">الإجراء</td>';
    prods.forEach(function(p){html+='<td class="cmp-val"><button class="pp-btn-cart" style="font-size:.75rem;padding:7px 12px;" onclick="addToCart('+p.id+')"><i class="fas fa-cart-plus"></i> سلة</button> <button class="pp-btn-compare" style="font-size:.75rem;padding:7px 12px;" onclick="navigateToProduct('+p.id+');_closeModal(\'compare-modal\')">عرض</button></td>';});
    html+='</tr></tbody></table></div>';
    wrap.innerHTML=html;
}

/* ── Crossroads Homepage ──────────────────────────────── */
var CROSSROADS_PATHS=[
{id:'products',icon:'fas fa-shopping-bag',emoji:'🛍️',active:true,url:'/store',
 color:'linear-gradient(135deg,#060e28,#0d1f55)',glow:'rgba(26,83,255,.35)',accent:'#3d7aff',
 labels:{ar:'المنتجات',en:'Products',fr:'Produits',es:'Productos',de:'Produkte',zh:'产品',it:'Prodotti'},
 subs:{ar:'تسوق ذكي بكل الفئات',en:'Smart shopping',fr:'Achats intelligents',es:'Compras inteligentes',de:'Einkaufen',zh:'智能购物',it:'Shopping smart'}},
{id:'trips',icon:'fas fa-plane',emoji:'✈️',coming:true,
 color:'linear-gradient(135deg,#041a10,#073d22)',glow:'rgba(5,150,105,.35)',accent:'#059669',
 labels:{ar:'الرحلات',en:'Trips',fr:'Voyages',es:'Viajes',de:'Reisen',zh:'旅行',it:'Viaggi'},
 subs:{ar:'اكتشف وجهات العالم',en:'Discover destinations',fr:'Explorer',es:'Descubrir',de:'Entdecken',zh:'探索目的地',it:'Scoprire'}},
{id:'realestate',icon:'fas fa-building',emoji:'🏢',coming:true,
 color:'linear-gradient(135deg,#1a0e03,#3d2008)',glow:'rgba(217,119,6,.35)',accent:'#d97706',
 labels:{ar:'العقارات',en:'Real Estate',fr:'Immobilier',es:'Inmobiliaria',de:'Immobilien',zh:'房地产',it:'Immobiliare'},
 subs:{ar:'فرص استثمارية',en:'Investment opportunities',fr:'Investissements',es:'Inversiones',de:'Investitionen',zh:'投资机会',it:'Investimenti'}},
{id:'medical',icon:'fas fa-heartbeat',emoji:'⚕️',active:true,url:'/medical',
 color:'linear-gradient(135deg,#1a0303,#3d0808)',glow:'rgba(220,38,38,.35)',accent:'#dc2626',
 labels:{ar:'الصحة والدواء',en:'Health',fr:'Sante',es:'Salud',de:'Gesundheit',zh:'健康',it:'Salute'},
 subs:{ar:'منتجات طبية وصحية',en:'Medical products',fr:'Produits medicaux',es:'Productos medicos',de:'Medizinprodukte',zh:'医疗产品',it:'Prodotti medici'}},
{id:'affiliate',icon:'fas fa-percentage',emoji:'💰',coming:true,
 color:'linear-gradient(135deg,#0d0520,#1e0a45)',glow:'rgba(124,58,237,.35)',accent:'#7c3aed',
 labels:{ar:'سوق العمولة',en:'Affiliate',fr:'Affiliation',es:'Afiliados',de:'Affiliate',zh:'联盟',it:'Affiliazione'},
 subs:{ar:'اربح من التسويق',en:'Earn commissions',fr:'Commissions',es:'Comisiones',de:'Provisionen',zh:'赚取佣金',it:'Commissioni'}},
{id:'freelance',icon:'fas fa-laptop-code',emoji:'💼',coming:true,
 color:'linear-gradient(135deg,#03111a,#072838)',glow:'rgba(37,99,235,.35)',accent:'#2563eb',
 labels:{ar:'العمل الحر',en:'Freelance',fr:'Freelance',es:'Freelance',de:'Freelance',zh:'自由职业',it:'Freelance'},
 subs:{ar:'خدمات احترافية',en:'Professional services',fr:'Services pro',es:'Servicios',de:'Dienste',zh:'专业服务',it:'Servizi'}},
];
function renderCrossroadsHero(){
    var hero=document.getElementById('crossroads-hero');
    if(!hero) return;
    var lang=(typeof currentLang!=='undefined'?currentLang:'ar');
    var tlines={ar:'اختر وجهتك',en:'Choose your destination',fr:'Choisissez votre destination',es:'Elige tu destino',de:'Waehle dein Ziel',zh:'选择目的地',it:'Scegli la destinazione'};
    var soons={ar:'قريباً',en:'Coming Soon',fr:'Bientot',es:'Proximamente',de:'Demnachst',zh:'即将推出',it:'Presto'};
    var html='<div class="cr-inner" style="min-height:100vh;">'
        +'<div class="cr-logo-wrap">'
        +'<img src="/logo.jpg" alt="MARASSiA" class="cr-logo-img" onerror="this.parentNode.innerHTML+=\'<div class=cr-logo-txt>MARASSiA</div>\';this.remove()">'
        +'<p class="cr-tagline">'+(tlines[lang]||tlines.ar)+'</p>'
        +'</div>'
        +'<div class="cr-paths">';
    CROSSROADS_PATHS.forEach(function(path,i){
        var label=(path.labels&&path.labels[lang])||path.labels.ar;
        var sub=(path.subs&&path.subs[lang])||path.subs.ar;
        var delay=(i*0.09)+'s';
        html+='<div class="cr-card'+(path.coming?' cr-coming':'')+'"'
            +' style="animation-delay:'+delay+';--cr-glow:'+path.glow+';--cr-accent:'+path.accent+'"'
            +' data-path="'+path.id+'" onclick="enterPath(this.dataset.path)">'
            +'<div class="cr-card-bg" style="background:'+path.color+'"></div>'
            +'<div class="cr-card-aurora"></div>'
            +'<div class="cr-card-content">'
            +'<div class="cr-card-emoji">'+path.emoji+'</div>'
            +'<div class="cr-card-icon"><i class="'+path.icon+'"></i></div>'
            +'<div class="cr-card-label">'+sanitize(label)+'</div>'
            +'<div class="cr-card-sub">'+sanitize(sub)+'</div>'
            +(path.coming
                ?'<div class="cr-coming-badge">'+(soons[lang]||soons.ar)+'</div>'
                :'<div class="cr-enter-arrow"><i class="fas fa-arrow-left"></i></div>')
            +'</div>'
            +'</div>';
    });
    html+='</div></div>';
    hero.innerHTML=html;
}
function enterPath(pathId){
    var path=CROSSROADS_PATHS.find(function(p){return p.id===pathId;});
    if(!path) return;
    if(path.coming){
        var lang=(typeof currentLang!=='undefined'?currentLang:'ar');
        var msgs={ar:'قريباً! تابع التحديثات 🚀',en:'Coming soon! 🚀',fr:'Bientot! 🚀',es:'Proximamente! 🚀',de:'Demnachst! 🚀',zh:'即将推出! 🚀',it:'Presto! 🚀'};
        showToast(msgs[lang]||msgs.ar,'info'); return;
    }
    if(pathId==='products') navigate('home');
    else navigate(pathId);
}
/* ── Category Journey Buttons ─────────────────────────── */

/* ═══ JOURNEY TRANSLATIONS ═════════════════════════════ */
var JOURNEY_STRINGS={
ar:{bestLabel:'الأفضل',fitLabel:'الأنسب لك',journeyBest:'🏆 الأفضل في',journeyFit:'✨ الأنسب لك في',
    budgetQ:'ما ميزانيتك؟',priorityQ:'ما أولوية شرائك؟',qualityQ:'مستوى الجودة؟',
    mostSold:'الأكثر مبيعاً',mostTrending:'الأكثر رواجاً',gifts:'هدايا قيمة',
    qualLow:'اقتصادي',qualMid:'متوسط',qualHigh:'عالي',qualVIP:'VIP فاخر',
    noProducts:'لا توجد منتجات في هذا القسم بعد',
    selectBudget:'اختر ميزانيتك',currencyNote:'بعملتك الحالية',
    budgetAny:'أي ميزانية',filterActive:'الفلتر نشط'},
en:{bestLabel:'Best',fitLabel:'Best for You',journeyBest:'🏆 Best in',journeyFit:'✨ Best for You in',
    budgetQ:'Your budget?',priorityQ:'Your priority?',qualityQ:'Quality level?',
    mostSold:'Best Sellers',mostTrending:'Trending',gifts:'Valuable Gifts',
    qualLow:'Budget',qualMid:'Standard',qualHigh:'Premium',qualVIP:'VIP Luxury',
    noProducts:'No products in this category yet',
    selectBudget:'Choose budget',currencyNote:'In your currency',
    budgetAny:'Any budget',filterActive:'Filter active'},
fr:{bestLabel:'Le Meilleur',fitLabel:'Le Plus Adapte',journeyBest:'🏆 Meilleur en',journeyFit:'✨ Plus adapte en',
    budgetQ:'Votre budget?',priorityQ:'Votre priorite?',qualityQ:'Niveau qualite?',
    mostSold:'Meilleures Ventes',mostTrending:'Tendance',gifts:'Cadeaux precieux',
    qualLow:'Economique',qualMid:'Standard',qualHigh:'Premium',qualVIP:'VIP Luxe',
    noProducts:'Aucun produit pour le moment',
    selectBudget:'Choisir budget',currencyNote:'Dans votre devise',
    budgetAny:'Tout budget',filterActive:'Filtre actif'},
es:{bestLabel:'El Mejor',fitLabel:'El Mas Adecuado',journeyBest:'🏆 Mejor en',journeyFit:'✨ Mas adecuado en',
    budgetQ:'Tu presupuesto?',priorityQ:'Tu prioridad?',qualityQ:'Nivel de calidad?',
    mostSold:'Mas Vendidos',mostTrending:'Tendencias',gifts:'Regalos valiosos',
    qualLow:'Economico',qualMid:'Estandar',qualHigh:'Premium',qualVIP:'VIP Lujo',
    noProducts:'Sin productos aun',
    selectBudget:'Elegir presupuesto',currencyNote:'En tu moneda',
    budgetAny:'Cualquier presupuesto',filterActive:'Filtro activo'},
de:{bestLabel:'Bestes',fitLabel:'Bestes fuer Sie',journeyBest:'🏆 Bestes in',journeyFit:'✨ Bestes fuer Sie in',
    budgetQ:'Ihr Budget?',priorityQ:'Ihre Prioritaet?',qualityQ:'Qualitaetsniveau?',
    mostSold:'Bestseller',mostTrending:'Trend',gifts:'Wertvolle Geschenke',
    qualLow:'Guenstig',qualMid:'Standard',qualHigh:'Premium',qualVIP:'VIP Luxus',
    noProducts:'Noch keine Produkte',
    selectBudget:'Budget waehlen',currencyNote:'In Ihrer Waehrung',
    budgetAny:'Jedes Budget',filterActive:'Filter aktiv'},
zh:{bestLabel:'最佳',fitLabel:'最适合您',journeyBest:'🏆 最佳',journeyFit:'✨ 最适合您',
    budgetQ:'您的预算?',priorityQ:'您的优先级?',qualityQ:'质量级别?',
    mostSold:'畅销',mostTrending:'热门',gifts:'珍贵礼品',
    qualLow:'经济',qualMid:'标准',qualHigh:'高级',qualVIP:'VIP奢华',
    noProducts:'暂无产品',
    selectBudget:'选择预算',currencyNote:'以您的货币',
    budgetAny:'任何预算',filterActive:'筛选中'},
it:{bestLabel:'Il Migliore',fitLabel:'Il Piu Adatto',journeyBest:'🏆 Migliore in',journeyFit:'✨ Piu adatto in',
    budgetQ:'Il tuo budget?',priorityQ:'La tua priorita?',qualityQ:'Livello qualita?',
    mostSold:'Piu Venduti',mostTrending:'Tendenza',gifts:'Regali preziosi',
    qualLow:'Economico',qualMid:'Standard',qualHigh:'Premium',qualVIP:'VIP Lusso',
    noProducts:'Nessun prodotto ancora',
    selectBudget:'Scegli budget',currencyNote:'Nella tua valuta',
    budgetAny:'Qualsiasi budget',filterActive:'Filtro attivo'},
};

function jt(key){
    var lang=(typeof currentLang!=='undefined'?currentLang:'ar');
    return (JOURNEY_STRINGS[lang]&&JOURNEY_STRINGS[lang][key])||(JOURNEY_STRINGS.ar[key])||key;
}

function renderCategoryJourneys(){
    var container=document.getElementById('cat-journey-row');
    if(!container) return;
    var lang=(typeof currentLang!=='undefined'?currentLang:'ar');
    var cats=db.categories||[];
    if(!cats.length){container.innerHTML='';return;}
    var html='<div class="journey-header">'
        +'<h3 class="journey-title"><i class="fas fa-rocket"></i>&nbsp;'
        +{ar:'ابدأ رحلة التسوق',en:'Start Shopping Journey',fr:'Commencer',es:'Comenzar',de:'Einkaufsreise',zh:'开始购物之旅',it:'Inizia il viaggio'}[lang]
        +'</h3></div><div class="journey-cats-row">';
    cats.forEach(function(cat){
        var label=(typeof tCat==='function'?tCat(cat):cat);
        html+='<div class="journey-cat-card">'
            +'<div class="journey-cat-name">'+sanitize(label)+'</div>'
            +'<div class="journey-cat-btns">'
            +'<button class="journey-btn journey-best" data-cat="'+sanitize(cat)+'" onclick="startJourney(\'best\',this.dataset.cat)">'
            +'<i class="fas fa-trophy"></i>&nbsp;'+jt('bestLabel')+'</button>'
            +'<button class="journey-btn journey-fit" data-cat="'+sanitize(cat)+'" onclick="startJourney(\'fit\',this.dataset.cat)">'
            +'<i class="fas fa-magic"></i>&nbsp;'+jt('fitLabel')+'</button>'
            +'</div></div>';
    });
    html+='</div>';
    container.innerHTML=html;
}
function startJourney(type,category){
    if(type==='best'){
        // Weighted score: sales(40%) + trending(30%) + VIP(30%)
        var prods=db.products.filter(function(p){return p.category===category;});
        var maxSales=Math.max.apply(null,prods.map(function(p){return p.salesCount||0;}))||1;
        var maxTrend=Math.max.apply(null,prods.map(function(p){return p.trending||0;}))||1;
        prods.sort(function(a,b){
            var sa=((a.salesCount||0)/maxSales)*40 + ((a.trending||0)/maxTrend)*30 + (a.vip?30:0);
            var sb=((b.salesCount||0)/maxSales)*40 + ((b.trending||0)/maxTrend)*30 + (b.vip?30:0);
            return sb-sa;
        });
        _showJourneyResult(jt('journeyBest')+' '+(typeof tCat==='function'?tCat(category):category),prods);
    } else {
        _openFitJourney(category);
    }
}function _showJourneyResult(title,prods){
    _ensureJourneyModal();
    var wrap=document.getElementById('journey-result');
    var lang=(typeof currentLang!=='undefined'?currentLang:'ar');
    if(!wrap) return;
    if(!prods.length){
        wrap.innerHTML='<p style="text-align:center;padding:30px;color:#aaa;">'+jt('noProducts')+'</p>';
        document.getElementById('journey-modal').style.display='flex'; return;
    }
    var html='<h3 class="journey-result-title">'+sanitize(title)+'</h3><div class="journey-result-grid">';
    prods.slice(0,8).forEach(function(p){
        var tr=(p.translations&&p.translations[lang])||{};
        var nm=tr.name||p.name||'';
        var priceStr=(typeof formatPrice==='function')?formatPrice(p.price):('$'+p.price);
        html+='<div class="journey-card" data-pid="'+p.id+'" onclick="navigateToProduct('+p.id+');_closeModal(\'journey-modal\')">';
        html+='<div class="journey-card-media">';
        html+='<img src="'+sanitize(p.media||'')+'"\'" alt="'+sanitize(nm)+'" loading="lazy">';
        if(p.vip) html+='<span class="vip-badge-card"><i class="fas fa-crown"></i> VIP</span>';
        html+='</div>';
        html+='<div class="journey-card-name">'+sanitize(nm)+'</div>';
        html+='<div class="journey-card-price">'+priceStr+'</div>';
        if(p.salesCount>0) html+='<div class="journey-card-sales"><i class="fas fa-fire"></i> '+p.salesCount+'</div>';
        html+='<button class="journey-card-btn"><i class="fas fa-arrow-left"></i></button>';
        html+='</div>';
    });
    html+='</div>';
    wrap.innerHTML=html;
    document.getElementById('journey-modal').style.display='flex';
}function _openFitJourney(category){
    _ensureJourneyModal();
    var wrap=document.getElementById('journey-result');
    if(!wrap) return;
    var lang=(typeof currentLang!=='undefined'?currentLang:'ar');
    var label=(typeof tCat==='function'?tCat(category):category);
    // Currency-aware budget ranges
    var currSym='$';
    try{ if(typeof LANGS!=='undefined'&&LANGS[lang]&&LANGS[lang].currency) currSym=LANGS[lang].currency; }catch(e){}
    var low=100,mid=500;
    if(['EGP','ج.م'].includes(currSym)){low=5000;mid=20000;}
    else if(currSym==='SAR'||currSym==='درهم'){low=400;mid=2000;}
    else if(currSym==='EUR'||currSym==='€'){low=90;mid=450;}
    var b1='< '+low+' '+currSym;
    var b2=low+' - '+mid+' '+currSym;
    var b3='> '+mid+' '+currSym;
    wrap.innerHTML='<div class="journey-fit-wrap">'
        +'<h3 class="journey-result-title">'+jt('journeyFit')+' '+sanitize(label)+'</h3>'
        +'<div class="journey-fit-step"><label class="journey-q-label">'+jt('budgetQ')+'</label>'
        +'<div class="journey-budget-btns">'
        +'<button class="journey-budget-btn" data-cat="'+sanitize(category)+'" data-max="'+low+'" onclick="_journeyBudget(this)">'+b1+'</button>'
        +'<button class="journey-budget-btn" data-cat="'+sanitize(category)+'" data-max="'+mid+'" onclick="_journeyBudget(this)">'+b2+'</button>'
        +'<button class="journey-budget-btn" data-cat="'+sanitize(category)+'" data-max="99999" onclick="_journeyBudget(this)">'+b3+'</button>'
        +'</div></div>'
        +'<div class="journey-fit-step" id="journey-step2" style="display:none">'
        +'<label class="journey-q-label">'+jt('priorityQ')+'</label>'
        +'<div class="journey-prio-btns">'
        +'<button class="journey-prio-btn" data-prio="sales" onclick="_journeyPrio(this)"><i class="fas fa-fire"></i>&nbsp;'+jt('mostSold')+'</button>'
        +'<button class="journey-prio-btn" data-prio="trending" onclick="_journeyPrio(this)"><i class="fas fa-chart-line"></i>&nbsp;'+jt('mostTrending')+'</button>'
        +'<button class="journey-prio-btn" data-prio="gifts" onclick="_journeyPrio(this)"><i class="fas fa-gift"></i>&nbsp;'+jt('gifts')+'</button>'
        +'</div></div>'
        +'<div class="journey-fit-step" id="journey-step3" style="display:none">'
        +'<label class="journey-q-label">'+jt('qualityQ')+'</label>'
        +'<div class="journey-prio-btns">'
        +'<button class="journey-prio-btn" data-qual="low" onclick="_journeyQual(this)">'+jt('qualLow')+'</button>'
        +'<button class="journey-prio-btn" data-qual="mid" onclick="_journeyQual(this)">'+jt('qualMid')+'</button>'
        +'<button class="journey-prio-btn" data-qual="high" onclick="_journeyQual(this)">'+jt('qualHigh')+'</button>'
        +'<button class="journey-prio-btn" data-qual="vip" onclick="_journeyQual(this)"><i class="fas fa-crown"></i>&nbsp;'+jt('qualVIP')+'</button>'
        +'</div></div>'
        +'</div>';
    document.getElementById('journey-modal').style.display='flex';
    // Store state
    window._jCat=category; window._jMax=null; window._jPrio=null;
}
function _journeyBudget(btn){
    window._jMax=parseFloat(btn.dataset.max)||99999;
    btn.parentNode.querySelectorAll('.journey-budget-btn').forEach(function(b){b.classList.remove('selected');});
    btn.classList.add('selected');
    var step2=document.getElementById('journey-step2');
    if(step2) step2.style.display='block';
}
function _journeyPrio(btn){
    window._jPrio=btn.dataset.prio;
    btn.parentNode.querySelectorAll('.journey-prio-btn').forEach(function(b){b.classList.remove('selected');});
    btn.classList.add('selected');
    var step3=document.getElementById('journey-step3');
    if(step3) step3.style.display='block';
}
function _journeyQual(btn){
    var qual=btn.dataset.qual;
    btn.parentNode.querySelectorAll('.journey-prio-btn').forEach(function(b){b.classList.remove('selected');});
    btn.classList.add('selected');
    var cat=window._jCat||'';
    var maxBudget=window._jMax||99999;
    var prio=window._jPrio||'sales';
    // Filter by budget
    var prods=db.products.filter(function(p){
        return p.category===cat && (p.price||0)<=maxBudget;
    });
    // Filter by quality
    if(qual==='vip') prods=prods.filter(function(p){return p.vip;});
    else if(qual==='high') prods=prods.filter(function(p){return !p.vip && (p.quality==='high'||(!p.quality&&(p.price||0)>200));});
    else if(qual==='mid') prods=prods.filter(function(p){return p.quality==='mid'||(!p.quality&&(p.price||0)>50&&(p.price||0)<=200);});
    else prods=prods.filter(function(p){return p.quality==='low'||(!p.quality&&(p.price||0)<=50);});
    // Sort by priority
    if(prio==='sales') prods.sort(function(a,b){return (b.salesCount||0)-(a.salesCount||0);});
    else if(prio==='trending') prods.sort(function(a,b){return (b.trending||0)-(a.trending||0);});
    else prods.sort(function(a,b){return (b.vip?1:0)-(a.vip?1:0)||(b.price||0)-(a.price||0);});
    // If no results, remove quality filter
    if(!prods.length){
        prods=db.products.filter(function(p){return p.category===cat&&(p.price||0)<=maxBudget;});
        if(prio==='sales') prods.sort(function(a,b){return (b.salesCount||0)-(a.salesCount||0);});
    }
    _showJourneyResult(jt('journeyFit')+' '+(typeof tCat==='function'?tCat(cat):cat),prods);
}

function _filterJourneyBudget(cat,max){
    var prods=db.products.filter(function(p){return p.category===cat&&(p.price||0)<=max;}).sort(function(a,b){return (b.salesCount||0)-(a.salesCount||0);});
    _showJourneyResult('💰 ضمن ميزانيتك في '+(typeof tCat==='function'?tCat(cat):cat),prods);
}
function _filterJourneyPrio(cat,priority){
    var prods=db.products.filter(function(p){return p.category===cat;});
    if(priority==='price') prods.sort(function(a,b){return (a.price||0)-(b.price||0);});
    else prods.sort(function(a,b){return (b.salesCount||0)-(a.salesCount||0);});
    var lbl={price:'الأرخص',sales:'الأكثر مبيعاً'};
    _showJourneyResult('⭐ '+(lbl[priority]||'')+'  في '+(typeof tCat==='function'?tCat(cat):cat),prods);
}
function _ensureJourneyModal(){
    if(document.getElementById('journey-modal')) return;
    var el=document.createElement('div');el.id='journey-modal';el.className='journey-modal-overlay';
    el.onclick=function(e){if(e.target===el)el.style.display='none';};
    el.innerHTML='<div class="journey-modal-box"><button class="journey-close" onclick="_closeModal(\'journey-modal\')"><i class="fas fa-times"></i></button><div id="journey-result"></div></div>';
    document.body.appendChild(el);
}

function saveAiProvider(provider) {
    if (!db.settings) db.settings = {};
    db.settings.aiProvider = provider;
    saveDb();
    showToast('✅ تم حفظ مزود الذكاء الاصطناعي: ' + provider);
}

/* ── Sidebar Links Admin ───────────────────────────── */
function addSidebarLink() {
    var label = (document.getElementById('new-link-label')||{}).value||'';
    var url   = (document.getElementById('new-link-url')||{}).value||'';
    if (!label) { showToast('أدخل نص الرابط', 'error'); return; }
    if (!db.sidebarLinks) db.sidebarLinks = [];
    db.sidebarLinks.push({ label: label.trim(), url: url.trim(), id: Date.now() });
    saveDb();
    renderSidebarLinksAdmin();
    if (typeof renderSidebarLinks === 'function') renderSidebarLinks();
    var le = document.getElementById('new-link-label');
    var ue = document.getElementById('new-link-url');
    if(le) le.value=''; if(ue) ue.value='';
    showToast('✅ تم إضافة الرابط');
}

function deleteSidebarLinkAdmin(id) {
    if (!confirm('حذف هذا الرابط؟')) return;
    db.sidebarLinks = (db.sidebarLinks||[]).filter(function(l){ return l.id !== id; });
    saveDb();
    renderSidebarLinksAdmin();
    if (typeof renderSidebarLinks === 'function') renderSidebarLinks();
    showToast('✅ تم الحذف');
}

function moveSidebarLink(id, dir) {
    var links = db.sidebarLinks || [];
    var idx = links.findIndex(function(l){ return l.id===id; });
    if (idx < 0) return;
    var newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= links.length) return;
    var tmp = links[idx]; links[idx]=links[newIdx]; links[newIdx]=tmp;
    db.sidebarLinks = links;
    saveDb();
    renderSidebarLinksAdmin();
    if (typeof renderSidebarLinks === 'function') renderSidebarLinks();
}

function renderSidebarLinksAdmin() {
    var list = document.getElementById('sidebar-links-list');
    if (!list) return;
    var links = db.sidebarLinks || [];
    if (!links.length) {
        list.innerHTML = '<div style="padding:12px;text-align:center;color:var(--adm-muted,#6b7a99);font-size:.82rem;">لا توجد روابط — أضف من الأعلى</div>';
        return;
    }
    list.innerHTML = links.map(function(l, i) {
        return '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:rgba(255,255,255,.03);border-radius:9px;margin-bottom:6px;border:1px solid rgba(255,255,255,.06);">' +
            '<div style="display:flex;flex-direction:column;gap:2px;">' +
                '<button onclick="moveSidebarLink(' + l.id + ',-1)" style="background:none;border:none;color:var(--adm-muted,#6b7a99);cursor:pointer;font-size:.6rem;line-height:1;">▲</button>' +
                '<button onclick="moveSidebarLink(' + l.id + ',1)" style="background:none;border:none;color:var(--adm-muted,#6b7a99);cursor:pointer;font-size:.6rem;line-height:1;">▼</button>' +
            '</div>' +
            '<div style="flex:1;">' +
                '<div style="font-weight:700;color:var(--at,#e8eeff);font-size:.84rem;">' + sanitize(l.label||'') + '</div>' +
                '<div style="font-size:.72rem;color:var(--adm-muted,#6b7a99);" dir="ltr">' + sanitize(l.url||'#') + '</div>' +
            '</div>' +
            '<button class="btn-del" onclick="deleteSidebarLinkAdmin(' + l.id + ')"><i class="fas fa-trash"></i></button>' +
     
function renderCrossroadsAdmin() {
    var cards = document.getElementById('crossroads-admin-cards');
    if (!cards || typeof CROSSROADS_PATHS === 'undefined') return;
    cards.innerHTML = CROSSROADS_PATHS.map(function(path) {
        var active = !path.coming;
        return '<div style="background:' + path.color + ';border-radius:14px;padding:16px;color:#fff;position:relative;">' +
            '<div style="font-size:1.5rem;margin-bottom:6px;">' + path.emoji + '</div>' +
            '<div style="font-weight:800;font-size:.9rem;">' + path.label + '</div>' +
            '<div style="font-size:.72rem;opacity:.75;margin-top:3px;">' + path.sub + '</div>' +
            '<div style="position:absolute;top:10px;left:10px;">' +
                (active
                    ? '<span style="background:rgba(34,197,94,.2);color:#22c55e;font-size:.65rem;padding:2px 8px;border-radius:20px;font-weight:800;">مفعّل</span>'
                    : '<span style="background:rgba(255,255,255,.15);font-size:.65rem;padding:2px 8px;border-radius:20px;">قريباً</span>') +
            '</div>' +
        '</div>';
    }).join('');
}
   '</div>';
    }).join('');
}

/* ── Product Extra Media ───────────────────────────── */
var _extraImages = [];
var _extraVideos = [];

function addExtraImage() {
    var url = (document.getElementById('extra-img-url')||{}).value||'';
    if (!url) { showToast('أدخل رابط الصورة', 'error'); return; }
    if (_extraImages.length >= 5) { showToast('5 صور كحد أقصى', 'error'); return; }
    if (_extraImages.includes(url)) { showToast('الصورة موجودة بالفعل', 'info'); return; }
    _extraImages.push(url.trim());
    renderExtraImages();
    var el = document.getElementById('extra-img-url'); if(el) el.value='';
}

function handleExtraImageUpload(input) {
    var file = input && input.files && input.files[0];
    if (!file) return;
    if (_extraImages.length >= 5) { showToast('5 صور كحد أقصى', 'error'); return; }
    if (typeof uploadToCloudinary === 'function') {
        uploadToCloudinary(file, null, function(err, url) {
            if (err || !url) { showToast('فشل الرفع: '+(err||''), 'error'); return; }
            _extraImages.push(url);
            renderExtraImages();
            showToast('✅ تم رفع الصورة');
        });
    } else if (typeof compressImage === 'function') {
        compressImage(file, function(data) {
            _extraImages.push(data);
            renderExtraImages();
        });
    }
}

function removeExtraImage(idx) {
    _extraImages.splice(idx, 1);
    renderExtraImages();
}

function renderExtraImages() {
    var list = document.getElementById('extra-images-list');
    if (!list) return;
    list.innerHTML = _extraImages.map(function(url, i) {
        return '<div style="position:relative;display:inline-block;">' +
            '<img src="' + sanitize(url) + '" style="width:60px;height:60px;object-fit:cover;border-radius:8px;border:2px solid rgba(61,122,255,.3);" loading="lazy">' +
            '<button onclick="removeExtraImage(' + i + ')" style="position:absolute;top:-6px;left:-6px;background:#ef4444;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:.6rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>' +
        '</div>';
    }).join('');
}

function addExtraVideo() {
    var url = (document.getElementById('extra-vid-url')||{}).value||'';
    if (!url) { showToast('أدخل رابط الفيديو', 'error'); return; }
    if (_extraVideos.length >= 3) { showToast('3 فيديوهات كحد أقصى', 'error'); return; }
    _extraVideos.push(url.trim());
    renderExtraVideos();
    var el = document.getElementById('extra-vid-url'); if(el) el.value='';
}

function removeExtraVideo(idx) {
    _extraVideos.splice(idx, 1);
    renderExtraVideos();
}

function renderExtraVideos() {
    var list = document.getElementById('extra-videos-list');
    if (!list) return;
    list.innerHTML = _extraVideos.map(function(url, i) {
        return '<div style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.04);border-radius:8px;padding:6px 10px;border:1px solid rgba(255,255,255,.08);">' +
            '<i class="fas fa-video" style="color:#a78bfa;"></i>' +
            '<span style="font-size:.75rem;color:var(--at,#e8eeff);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" dir="ltr">' + sanitize(url) + '</span>' +
            '<button onclick="removeExtraVideo(' + i + ')" style="background:none;border:none;color:#fca5a5;cursor:pointer;font-size:.9rem;margin-right:auto;">×</button>' +
        '</div>';
    }).join('');
}

/* Reset extra media when opening edit form */
function _resetExtraMedia(product) {
    _extraImages = (product && product.images) ? product.images.slice() : [];
    _extraVideos = (product && product.videos) ? product.videos.slice() : [];
    renderExtraImages();
    renderExtraVideos();
}
