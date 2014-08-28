var _paq = _paq || [];

// Custom Variable Tracking
_paq.push(['setCustomVariable',
    // Index, the number from 1 to 5 where this custom variable name is stored
    1,
    // Name, the name of the variable, for example: Gender, VisitorType
    "VisitorType",
    // Value, for example: "Male", "Female" or "new", "engaged", "customer"
    "Member",
    // Scope of the custom variable, "visit" means the custom variable applies to the current visit
    "visit"
]);

_paq.push(['trackPageView']);
_paq.push(['enableLinkTracking']);
(function() {
    var u=(("https:" == document.location.protocol) ? "https" : "http") + "://10.10.10.145/webapps/piwik/";
    _paq.push(['setTrackerUrl', u+'piwik.php']);
    _paq.push(['setSiteId', 5]);
    var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0]; g.type='text/javascript';
    g.defer=true; g.async=true; g.src=u+'piwik.js'; s.parentNode.insertBefore(g,s);
})();
console.log(this);