#!/usr/bin/env python3
"""
Backend API test suite for multi-tenant restaurant ordering SaaS
Tests tenant resolution, customer auth, checkout, admin operations, and platform management
"""

import requests
import json
import time
from typing import Dict, Optional

# Base URL for testing
BASE_URL = "http://localhost:3000/api"

# Test results tracking
test_results = {
    "passed": [],
    "failed": [],
    "total": 0
}

def log_test(name: str, passed: bool, details: str = ""):
    """Log test result"""
    test_results["total"] += 1
    if passed:
        test_results["passed"].append(name)
        print(f"✅ PASS: {name}")
    else:
        test_results["failed"].append(name)
        print(f"❌ FAIL: {name}")
        if details:
            print(f"   Details: {details}")

def make_request(method: str, path: str, host: str = "localhost", 
                 json_data: Optional[Dict] = None, cookies: Optional[Dict] = None,
                 expect_status: int = 200) -> tuple:
    """Make HTTP request with Host header"""
    url = f"{BASE_URL}{path}"
    headers = {"Host": host, "Content-Type": "application/json"}
    
    try:
        if method == "GET":
            resp = requests.get(url, headers=headers, cookies=cookies, timeout=10)
        elif method == "POST":
            resp = requests.post(url, headers=headers, json=json_data, cookies=cookies, timeout=10)
        elif method == "PATCH":
            resp = requests.patch(url, headers=headers, json=json_data, cookies=cookies, timeout=10)
        elif method == "DELETE":
            resp = requests.delete(url, headers=headers, cookies=cookies, timeout=10)
        else:
            return None, f"Unsupported method: {method}"
        
        # Check status code
        if resp.status_code != expect_status:
            return resp, f"Expected status {expect_status}, got {resp.status_code}. Response: {resp.text[:200]}"
        
        return resp, None
    except Exception as e:
        return None, f"Request failed: {str(e)}"

print("=" * 80)
print("BACKEND API TEST SUITE - Multi-tenant Restaurant Ordering SaaS")
print("=" * 80)

# ============================================================================
# TEST 1: Tenant Resolution
# ============================================================================
print("\n[TEST 1] Tenant Resolution from Host Header")

# Test 1.1: White Mug tenant
resp, err = make_request("GET", "/tenant", host="thewhitemug.site")
if err:
    log_test("1.1 - GET /api/tenant with Host: thewhitemug.site", False, err)
else:
    data = resp.json()
    if data.get("tenant", {}).get("business_name") == "The White Mug":
        # Check that payment_settings secrets are NOT in response
        if "payment_settings" in data.get("tenant", {}):
            log_test("1.1 - GET /api/tenant with Host: thewhitemug.site", False, 
                    "payment_settings should not be in response, only 'payment' object")
        elif "payment" in data.get("tenant", {}):
            log_test("1.1 - GET /api/tenant with Host: thewhitemug.site", True)
        else:
            log_test("1.1 - GET /api/tenant with Host: thewhitemug.site", False, 
                    "Missing 'payment' object in response")
    else:
        log_test("1.1 - GET /api/tenant with Host: thewhitemug.site", False, 
                f"Expected 'The White Mug', got {data.get('tenant', {}).get('business_name')}")

# Test 1.2: ABC Hotel tenant
resp, err = make_request("GET", "/tenant", host="abchotel.com")
if err:
    log_test("1.2 - GET /api/tenant with Host: abchotel.com", False, err)
else:
    data = resp.json()
    if data.get("tenant", {}).get("business_name") == "ABC Hotel":
        log_test("1.2 - GET /api/tenant with Host: abchotel.com", True)
    else:
        log_test("1.2 - GET /api/tenant with Host: abchotel.com", False, 
                f"Expected 'ABC Hotel', got {data.get('tenant', {}).get('business_name')}")

# Test 1.3: Unknown domain should return 404
resp, err = make_request("GET", "/tenant", host="unknown-domain.com", expect_status=404)
if err:
    log_test("1.3 - GET /api/tenant with unknown host -> 404", False, err)
else:
    data = resp.json()
    if data.get("code") == "UNKNOWN_DOMAIN":
        log_test("1.3 - GET /api/tenant with unknown host -> 404", True)
    else:
        log_test("1.3 - GET /api/tenant with unknown host -> 404", False, 
                f"Expected code 'UNKNOWN_DOMAIN', got {data.get('code')}")

# Test 1.4: Menu returns different tenant-scoped data
resp, err = make_request("GET", "/menu", host="thewhitemug.site")
if err:
    log_test("1.4 - GET /api/menu for White Mug (6 categories, 14 products)", False, err)
else:
    data = resp.json()
    cats = len(data.get("categories", []))
    prods = len(data.get("products", []))
    if cats == 6 and prods == 14:
        log_test("1.4 - GET /api/menu for White Mug (6 categories, 14 products)", True)
    else:
        log_test("1.4 - GET /api/menu for White Mug (6 categories, 14 products)", False, 
                f"Expected 6 cats/14 products, got {cats} cats/{prods} products")

resp, err = make_request("GET", "/menu", host="abchotel.com")
if err:
    log_test("1.5 - GET /api/menu for ABC Hotel (5 categories, 13 products)", False, err)
else:
    data = resp.json()
    cats = len(data.get("categories", []))
    prods = len(data.get("products", []))
    if cats == 5 and prods == 13:
        log_test("1.5 - GET /api/menu for ABC Hotel (5 categories, 13 products)", True)
    else:
        log_test("1.5 - GET /api/menu for ABC Hotel (5 categories, 13 products)", False, 
                f"Expected 5 cats/13 products, got {cats} cats/{prods} products")

# Test 1.6: Preview switch (only on localhost)
resp, err = make_request("POST", "/preview/switch", host="localhost", 
                        json_data={"slug": "abc-hotel"})
if err:
    log_test("1.6 - POST /api/preview/switch on localhost", False, err)
else:
    data = resp.json()
    cookies = resp.cookies
    if "preview_tenant" in cookies and data.get("tenant", {}).get("business_name") == "ABC Hotel":
        # Now GET /api/tenant should return ABC Hotel
        resp2, err2 = make_request("GET", "/tenant", host="localhost", cookies=cookies)
        if err2:
            log_test("1.6 - POST /api/preview/switch on localhost", False, err2)
        else:
            data2 = resp2.json()
            if data2.get("tenant", {}).get("business_name") == "ABC Hotel":
                log_test("1.6 - POST /api/preview/switch on localhost", True)
            else:
                log_test("1.6 - POST /api/preview/switch on localhost", False, 
                        f"After switch, expected ABC Hotel, got {data2.get('tenant', {}).get('business_name')}")
    else:
        log_test("1.6 - POST /api/preview/switch on localhost", False, 
                "Cookie not set or tenant not switched")

# Test 1.7: Preview switch should be forbidden on tenant domain
resp, err = make_request("POST", "/preview/switch", host="thewhitemug.site", 
                        json_data={"slug": "abc-hotel"}, expect_status=403)
if err:
    log_test("1.7 - POST /api/preview/switch on thewhitemug.site -> 403", False, err)
else:
    log_test("1.7 - POST /api/preview/switch on thewhitemug.site -> 403", True)

# ============================================================================
# TEST 2: Customer OTP Auth
# ============================================================================
print("\n[TEST 2] Customer OTP Authentication")

# Test 2.1: Request OTP
phone = "9111122223"
resp, err = make_request("POST", "/auth/otp/request", host="thewhitemug.site", 
                        json_data={"phone": phone})
if err:
    log_test("2.1 - POST /api/auth/otp/request", False, err)
    dev_otp = None
else:
    data = resp.json()
    dev_otp = data.get("dev_otp")
    if dev_otp:
        log_test("2.1 - POST /api/auth/otp/request returns dev_otp", True)
    else:
        log_test("2.1 - POST /api/auth/otp/request returns dev_otp", False, 
                "No dev_otp in response")

# Test 2.2: Verify with wrong code
resp, err = make_request("POST", "/auth/otp/verify", host="thewhitemug.site", 
                        json_data={"phone": phone, "code": "000000", "name": "Test User"}, 
                        expect_status=400)
if err:
    log_test("2.2 - POST /api/auth/otp/verify with wrong code -> 400", False, err)
else:
    log_test("2.2 - POST /api/auth/otp/verify with wrong code -> 400", True)

# Test 2.3: Verify with correct code
customer_cookies = None
if dev_otp:
    resp, err = make_request("POST", "/auth/otp/verify", host="thewhitemug.site", 
                            json_data={"phone": phone, "code": dev_otp, "name": "Test User"})
    if err:
        log_test("2.3 - POST /api/auth/otp/verify with correct code", False, err)
    else:
        data = resp.json()
        customer_cookies = resp.cookies
        if "cust_session" in customer_cookies and data.get("customer"):
            log_test("2.3 - POST /api/auth/otp/verify with correct code", True)
        else:
            log_test("2.3 - POST /api/auth/otp/verify with correct code", False, 
                    "No cust_session cookie or customer in response")
else:
    log_test("2.3 - POST /api/auth/otp/verify with correct code", False, 
            "Skipped - no dev_otp from previous test")

# Test 2.4: GET /api/auth/me returns customer
if customer_cookies:
    resp, err = make_request("GET", "/auth/me", host="thewhitemug.site", 
                            cookies=customer_cookies)
    if err:
        log_test("2.4 - GET /api/auth/me returns customer", False, err)
    else:
        data = resp.json()
        if data.get("customer"):
            log_test("2.4 - GET /api/auth/me returns customer", True)
        else:
            log_test("2.4 - GET /api/auth/me returns customer", False, 
                    "No customer in response")
else:
    log_test("2.4 - GET /api/auth/me returns customer", False, 
            "Skipped - no customer cookies")

# Test 2.5: Invalid phone
resp, err = make_request("POST", "/auth/otp/request", host="thewhitemug.site", 
                        json_data={"phone": "invalid"}, expect_status=400)
if err:
    log_test("2.5 - POST /api/auth/otp/request with invalid phone -> 400", False, err)
else:
    log_test("2.5 - POST /api/auth/otp/request with invalid phone -> 400", True)

# Test 2.6: Add address
if customer_cookies:
    resp, err = make_request("POST", "/auth/addresses", host="thewhitemug.site", 
                            cookies=customer_cookies,
                            json_data={"line1": "123 Test Street", "city": "Mumbai", "pincode": "400001"})
    if err:
        log_test("2.6 - POST /api/auth/addresses", False, err)
        address_id = None
    else:
        data = resp.json()
        address_id = data.get("address", {}).get("id")
        if address_id:
            log_test("2.6 - POST /api/auth/addresses", True)
        else:
            log_test("2.6 - POST /api/auth/addresses", False, "No address id in response")
else:
    log_test("2.6 - POST /api/auth/addresses", False, "Skipped - no customer cookies")
    address_id = None

# Test 2.7: Delete address
if customer_cookies and address_id:
    resp, err = make_request("DELETE", f"/auth/addresses/{address_id}", 
                            host="thewhitemug.site", cookies=customer_cookies)
    if err:
        log_test("2.7 - DELETE /api/auth/addresses/:id", False, err)
    else:
        log_test("2.7 - DELETE /api/auth/addresses/:id", True)
else:
    log_test("2.7 - DELETE /api/auth/addresses/:id", False, 
            "Skipped - no customer cookies or address id")

# ============================================================================
# TEST 3: Checkout Quote
# ============================================================================
print("\n[TEST 3] Checkout Quote Calculation")

# First, get menu to find product IDs
resp, err = make_request("GET", "/menu", host="thewhitemug.site")
if err:
    print(f"Cannot get menu for checkout tests: {err}")
    signature_latte_id = None
    large_variant_id = None
    oat_milk_addon_id = None
    banana_loaf_id = None
else:
    menu_data = resp.json()
    products = menu_data.get("products", [])
    
    # Find Signature Latte
    signature_latte = next((p for p in products if "Signature Latte" in p.get("name", "")), None)
    if signature_latte:
        signature_latte_id = signature_latte.get("id")
        large_variant = next((v for v in signature_latte.get("variants", []) if "Large" in v.get("name", "")), None)
        large_variant_id = large_variant.get("id") if large_variant else None
        oat_milk_addon = next((a for a in signature_latte.get("addons", []) if "Oat" in a.get("name", "")), None)
        oat_milk_addon_id = oat_milk_addon.get("id") if oat_milk_addon else None
    else:
        signature_latte_id = None
        large_variant_id = None
        oat_milk_addon_id = None
    
    # Find Banana Walnut Loaf (should be unavailable)
    banana_loaf = next((p for p in products if "Banana" in p.get("name", "") and "Loaf" in p.get("name", "")), None)
    banana_loaf_id = banana_loaf.get("id") if banana_loaf else None

# Test 3.1: Quote with PICKUP mode
if signature_latte_id and large_variant_id and oat_milk_addon_id:
    resp, err = make_request("POST", "/checkout/quote", host="thewhitemug.site",
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "addon_ids": [oat_milk_addon_id],
                                    "qty": 2
                                }],
                                "mode": "PICKUP"
                            })
    if err:
        log_test("3.1 - POST /api/checkout/quote PICKUP mode", False, err)
    else:
        data = resp.json()
        subtotal = data.get("subtotal")
        tax = data.get("tax")
        packaging = data.get("packaging_fee")
        total = data.get("total")
        # Expected: 2*(220+50)=540, tax=5% of 540=27, packaging=10, total=577
        if subtotal == 540 and tax == 27 and packaging == 10 and total == 577:
            log_test("3.1 - POST /api/checkout/quote PICKUP mode (subtotal=540, tax=27, packaging=10, total=577)", True)
        else:
            log_test("3.1 - POST /api/checkout/quote PICKUP mode", False, 
                    f"Expected subtotal=540, tax=27, packaging=10, total=577; got subtotal={subtotal}, tax={tax}, packaging={packaging}, total={total}")
else:
    log_test("3.1 - POST /api/checkout/quote PICKUP mode", False, 
            "Skipped - could not find Signature Latte product")

# Test 3.2: Quote with DELIVERY mode (delivery_fee should be 0 if subtotal >= 499)
if signature_latte_id and large_variant_id and oat_milk_addon_id:
    resp, err = make_request("POST", "/checkout/quote", host="thewhitemug.site",
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "addon_ids": [oat_milk_addon_id],
                                    "qty": 2
                                }],
                                "mode": "DELIVERY"
                            })
    if err:
        log_test("3.2 - POST /api/checkout/quote DELIVERY mode (free delivery above 499)", False, err)
    else:
        data = resp.json()
        delivery_fee = data.get("delivery_fee")
        if delivery_fee == 0:
            log_test("3.2 - POST /api/checkout/quote DELIVERY mode (free delivery above 499)", True)
        else:
            log_test("3.2 - POST /api/checkout/quote DELIVERY mode (free delivery above 499)", False, 
                    f"Expected delivery_fee=0, got {delivery_fee}")
else:
    log_test("3.2 - POST /api/checkout/quote DELIVERY mode", False, 
            "Skipped - could not find Signature Latte product")

# Test 3.3: Quote without variant_id (should error)
if signature_latte_id:
    resp, err = make_request("POST", "/checkout/quote", host="thewhitemug.site",
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "qty": 1
                                }],
                                "mode": "PICKUP"
                            })
    if err:
        log_test("3.3 - POST /api/checkout/quote without variant_id -> error", False, err)
    else:
        data = resp.json()
        errors = data.get("errors", [])
        if errors and any("choose an option" in e.get("message", "").lower() for e in errors):
            log_test("3.3 - POST /api/checkout/quote without variant_id -> error", True)
        else:
            log_test("3.3 - POST /api/checkout/quote without variant_id -> error", False, 
                    f"Expected error about choosing option, got errors: {errors}")
else:
    log_test("3.3 - POST /api/checkout/quote without variant_id", False, 
            "Skipped - could not find Signature Latte product")

# Test 3.4: Quote with unavailable product
if banana_loaf_id:
    resp, err = make_request("POST", "/checkout/quote", host="thewhitemug.site",
                            json_data={
                                "items": [{
                                    "product_id": banana_loaf_id,
                                    "qty": 1
                                }],
                                "mode": "PICKUP"
                            })
    if err:
        log_test("3.4 - POST /api/checkout/quote with unavailable product -> error", False, err)
    else:
        data = resp.json()
        errors = data.get("errors", [])
        if errors and any("unavailable" in e.get("message", "").lower() for e in errors):
            log_test("3.4 - POST /api/checkout/quote with unavailable product -> error", True)
        else:
            log_test("3.4 - POST /api/checkout/quote with unavailable product -> error", False, 
                    f"Expected error about unavailable, got errors: {errors}")
else:
    log_test("3.4 - POST /api/checkout/quote with unavailable product", False, 
            "Skipped - could not find Banana Walnut Loaf product")

# Test 3.5: Quote with coupon WELCOME10
if signature_latte_id and large_variant_id and oat_milk_addon_id:
    resp, err = make_request("POST", "/checkout/quote", host="thewhitemug.site",
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "addon_ids": [oat_milk_addon_id],
                                    "qty": 2
                                }],
                                "mode": "PICKUP",
                                "coupon_code": "WELCOME10"
                            })
    if err:
        log_test("3.5 - POST /api/checkout/quote with coupon WELCOME10", False, err)
    else:
        data = resp.json()
        discount = data.get("discount")
        coupon = data.get("coupon", {})
        # Expected: 10% of 540 = 54 (max 100, min 299)
        if discount == 54 and coupon.get("ok"):
            log_test("3.5 - POST /api/checkout/quote with coupon WELCOME10 (discount=54)", True)
        else:
            log_test("3.5 - POST /api/checkout/quote with coupon WELCOME10", False, 
                    f"Expected discount=54 and coupon.ok=true, got discount={discount}, coupon.ok={coupon.get('ok')}")
else:
    log_test("3.5 - POST /api/checkout/quote with coupon WELCOME10", False, 
            "Skipped - could not find Signature Latte product")

# Test 3.6: Quote with coupon FLAT50
if signature_latte_id and large_variant_id and oat_milk_addon_id:
    resp, err = make_request("POST", "/checkout/quote", host="thewhitemug.site",
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "addon_ids": [oat_milk_addon_id],
                                    "qty": 2
                                }],
                                "mode": "PICKUP",
                                "coupon_code": "FLAT50"
                            })
    if err:
        log_test("3.6 - POST /api/checkout/quote with coupon FLAT50", False, err)
    else:
        data = resp.json()
        discount = data.get("discount")
        if discount == 50:
            log_test("3.6 - POST /api/checkout/quote with coupon FLAT50 (discount=50)", True)
        else:
            log_test("3.6 - POST /api/checkout/quote with coupon FLAT50", False, 
                    f"Expected discount=50, got {discount}")
else:
    log_test("3.6 - POST /api/checkout/quote with coupon FLAT50", False, 
            "Skipped - could not find Signature Latte product")

# Test 3.7: Quote with invalid coupon
if signature_latte_id and large_variant_id:
    resp, err = make_request("POST", "/checkout/quote", host="thewhitemug.site",
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "qty": 1
                                }],
                                "mode": "PICKUP",
                                "coupon_code": "BOGUS"
                            })
    if err:
        log_test("3.7 - POST /api/checkout/quote with invalid coupon", False, err)
    else:
        data = resp.json()
        coupon = data.get("coupon", {})
        if not coupon.get("ok") and "invalid" in coupon.get("error", "").lower():
            log_test("3.7 - POST /api/checkout/quote with invalid coupon -> coupon.ok=false", True)
        else:
            log_test("3.7 - POST /api/checkout/quote with invalid coupon", False, 
                    f"Expected coupon.ok=false with error, got {coupon}")
else:
    log_test("3.7 - POST /api/checkout/quote with invalid coupon", False, 
            "Skipped - could not find Signature Latte product")

# Test 3.8: Quote with ROOM_SERVICE mode on White Mug (should error)
if signature_latte_id and large_variant_id:
    resp, err = make_request("POST", "/checkout/quote", host="thewhitemug.site",
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "qty": 1
                                }],
                                "mode": "ROOM_SERVICE"
                            })
    if err:
        log_test("3.8 - POST /api/checkout/quote with ROOM_SERVICE on White Mug -> error", False, err)
    else:
        data = resp.json()
        errors = data.get("errors", [])
        if errors and any("not available" in e.get("message", "").lower() for e in errors):
            log_test("3.8 - POST /api/checkout/quote with ROOM_SERVICE on White Mug -> error", True)
        else:
            log_test("3.8 - POST /api/checkout/quote with ROOM_SERVICE on White Mug", False, 
                    f"Expected error about mode not available, got errors: {errors}")
else:
    log_test("3.8 - POST /api/checkout/quote with ROOM_SERVICE on White Mug", False, 
            "Skipped - could not find Signature Latte product")

# ============================================================================
# TEST 4: Order Placement
# ============================================================================
print("\n[TEST 4] Order Placement")

# Test 4.1: Place order without cookie -> 401
if signature_latte_id and large_variant_id:
    resp, err = make_request("POST", "/checkout/place", host="thewhitemug.site",
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "qty": 1
                                }],
                                "mode": "PICKUP",
                                "idempotency_key": "test-key-no-auth",
                                "payment_method": "COD",
                                "contact": {"name": "Test", "phone": "9111122223"}
                            }, expect_status=401)
    if err:
        log_test("4.1 - POST /api/checkout/place without cookie -> 401", False, err)
    else:
        log_test("4.1 - POST /api/checkout/place without cookie -> 401", True)
else:
    log_test("4.1 - POST /api/checkout/place without cookie -> 401", False, 
            "Skipped - could not find Signature Latte product")

# Test 4.2: Place order with cookie
order_id = None
if customer_cookies and signature_latte_id and large_variant_id and oat_milk_addon_id:
    idempotency_key = f"test-key-{int(time.time())}"
    resp, err = make_request("POST", "/checkout/place", host="thewhitemug.site",
                            cookies=customer_cookies,
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "addon_ids": [oat_milk_addon_id],
                                    "qty": 2
                                }],
                                "mode": "PICKUP",
                                "idempotency_key": idempotency_key,
                                "payment_method": "COD",
                                "contact": {"name": "Test User", "phone": "9111122223"},
                                "coupon_code": "WELCOME10"
                            })
    if err:
        log_test("4.2 - POST /api/checkout/place with cookie", False, err)
    else:
        data = resp.json()
        order = data.get("order", {})
        order_id = order.get("id")
        if (order.get("status") == "ORDER_PLACED" and 
            order.get("order_number") and 
            order.get("coupon_code") == "WELCOME10"):
            log_test("4.2 - POST /api/checkout/place with cookie (status=ORDER_PLACED, coupon=WELCOME10)", True)
        else:
            log_test("4.2 - POST /api/checkout/place with cookie", False, 
                    f"Expected status=ORDER_PLACED and coupon=WELCOME10, got status={order.get('status')}, coupon={order.get('coupon_code')}")
else:
    log_test("4.2 - POST /api/checkout/place with cookie", False, 
            "Skipped - no customer cookies or product IDs")

# Test 4.3: Repeat with same idempotency_key -> returns same order
if customer_cookies and signature_latte_id and large_variant_id and oat_milk_addon_id and order_id:
    resp, err = make_request("POST", "/checkout/place", host="thewhitemug.site",
                            cookies=customer_cookies,
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "addon_ids": [oat_milk_addon_id],
                                    "qty": 2
                                }],
                                "mode": "PICKUP",
                                "idempotency_key": idempotency_key,
                                "payment_method": "COD",
                                "contact": {"name": "Test User", "phone": "9111122223"}
                            })
    if err:
        log_test("4.3 - POST /api/checkout/place with same idempotency_key -> duplicate", False, err)
    else:
        data = resp.json()
        if data.get("duplicate") and data.get("order", {}).get("id") == order_id:
            log_test("4.3 - POST /api/checkout/place with same idempotency_key -> duplicate", True)
        else:
            log_test("4.3 - POST /api/checkout/place with same idempotency_key", False, 
                    f"Expected duplicate=true and same order id, got duplicate={data.get('duplicate')}")
else:
    log_test("4.3 - POST /api/checkout/place with same idempotency_key", False, 
            "Skipped - no previous order")

# Test 4.4: DINE_IN without table_number -> 400
if customer_cookies and signature_latte_id and large_variant_id:
    resp, err = make_request("POST", "/checkout/place", host="thewhitemug.site",
                            cookies=customer_cookies,
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "qty": 1
                                }],
                                "mode": "DINE_IN",
                                "idempotency_key": f"test-key-dine-{int(time.time())}",
                                "payment_method": "COD",
                                "contact": {"name": "Test", "phone": "9111122223"}
                            }, expect_status=400)
    if err:
        log_test("4.4 - POST /api/checkout/place DINE_IN without table_number -> 400", False, err)
    else:
        log_test("4.4 - POST /api/checkout/place DINE_IN without table_number -> 400", True)
else:
    log_test("4.4 - POST /api/checkout/place DINE_IN without table_number", False, 
            "Skipped - no customer cookies or product IDs")

# Test 4.5: DELIVERY without address -> 400
if customer_cookies and signature_latte_id and large_variant_id:
    resp, err = make_request("POST", "/checkout/place", host="thewhitemug.site",
                            cookies=customer_cookies,
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "qty": 1
                                }],
                                "mode": "DELIVERY",
                                "idempotency_key": f"test-key-delivery-{int(time.time())}",
                                "payment_method": "COD",
                                "contact": {"name": "Test", "phone": "9111122223"}
                            }, expect_status=400)
    if err:
        log_test("4.5 - POST /api/checkout/place DELIVERY without address -> 400", False, err)
    else:
        log_test("4.5 - POST /api/checkout/place DELIVERY without address -> 400", True)
else:
    log_test("4.5 - POST /api/checkout/place DELIVERY without address", False, 
            "Skipped - no customer cookies or product IDs")

# Test 4.6: payment_method RAZORPAY -> 400
if customer_cookies and signature_latte_id and large_variant_id:
    resp, err = make_request("POST", "/checkout/place", host="thewhitemug.site",
                            cookies=customer_cookies,
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "qty": 1
                                }],
                                "mode": "PICKUP",
                                "idempotency_key": f"test-key-razorpay-{int(time.time())}",
                                "payment_method": "RAZORPAY",
                                "contact": {"name": "Test", "phone": "9111122223"}
                            }, expect_status=400)
    if err:
        log_test("4.6 - POST /api/checkout/place with RAZORPAY -> 400 PAYMENT_UNAVAILABLE", False, err)
    else:
        data = resp.json()
        if data.get("code") == "PAYMENT_UNAVAILABLE":
            log_test("4.6 - POST /api/checkout/place with RAZORPAY -> 400 PAYMENT_UNAVAILABLE", True)
        else:
            log_test("4.6 - POST /api/checkout/place with RAZORPAY", False, 
                    f"Expected code PAYMENT_UNAVAILABLE, got {data.get('code')}")
else:
    log_test("4.6 - POST /api/checkout/place with RAZORPAY", False, 
            "Skipped - no customer cookies or product IDs")

# Test 4.7: GET /api/orders lists the order
if customer_cookies and order_id:
    resp, err = make_request("GET", "/orders", host="thewhitemug.site", 
                            cookies=customer_cookies)
    if err:
        log_test("4.7 - GET /api/orders lists orders", False, err)
    else:
        data = resp.json()
        orders = data.get("orders", [])
        if any(o.get("id") == order_id for o in orders):
            log_test("4.7 - GET /api/orders lists orders", True)
        else:
            log_test("4.7 - GET /api/orders lists orders", False, 
                    f"Order {order_id} not found in list")
else:
    log_test("4.7 - GET /api/orders lists orders", False, 
            "Skipped - no customer cookies or order id")

# Test 4.8: GET /api/orders/:id works
if customer_cookies and order_id:
    resp, err = make_request("GET", f"/orders/{order_id}", host="thewhitemug.site", 
                            cookies=customer_cookies)
    if err:
        log_test("4.8 - GET /api/orders/:id returns order", False, err)
    else:
        data = resp.json()
        if data.get("order", {}).get("id") == order_id:
            log_test("4.8 - GET /api/orders/:id returns order", True)
        else:
            log_test("4.8 - GET /api/orders/:id returns order", False, 
                    "Order not found or wrong id")
else:
    log_test("4.8 - GET /api/orders/:id returns order", False, 
            "Skipped - no customer cookies or order id")

# Test 4.9: Different customer cannot access order
# Create a new customer
phone2 = "9222233334"
resp, err = make_request("POST", "/auth/otp/request", host="thewhitemug.site", 
                        json_data={"phone": phone2})
if not err:
    data = resp.json()
    dev_otp2 = data.get("dev_otp")
    if dev_otp2:
        resp, err = make_request("POST", "/auth/otp/verify", host="thewhitemug.site", 
                                json_data={"phone": phone2, "code": dev_otp2, "name": "Test User 2"})
        if not err:
            customer2_cookies = resp.cookies
            if order_id:
                resp, err = make_request("GET", f"/orders/{order_id}", host="thewhitemug.site", 
                                        cookies=customer2_cookies, expect_status=404)
                if err:
                    log_test("4.9 - Different customer GET /api/orders/:id -> 404", False, err)
                else:
                    log_test("4.9 - Different customer GET /api/orders/:id -> 404", True)
            else:
                log_test("4.9 - Different customer GET /api/orders/:id -> 404", False, 
                        "Skipped - no order id")
        else:
            log_test("4.9 - Different customer GET /api/orders/:id -> 404", False, 
                    "Could not verify OTP for second customer")
    else:
        log_test("4.9 - Different customer GET /api/orders/:id -> 404", False, 
                "Could not get dev_otp for second customer")
else:
    log_test("4.9 - Different customer GET /api/orders/:id -> 404", False, 
            "Could not request OTP for second customer")

# Test 4.10: Cancel order
if customer_cookies and order_id:
    resp, err = make_request("POST", f"/orders/{order_id}/cancel", host="thewhitemug.site", 
                            cookies=customer_cookies)
    if err:
        log_test("4.10 - POST /api/orders/:id/cancel -> CANCELLED", False, err)
    else:
        data = resp.json()
        if data.get("order", {}).get("status") == "CANCELLED":
            log_test("4.10 - POST /api/orders/:id/cancel -> CANCELLED", True)
        else:
            log_test("4.10 - POST /api/orders/:id/cancel", False, 
                    f"Expected status CANCELLED, got {data.get('order', {}).get('status')}")
else:
    log_test("4.10 - POST /api/orders/:id/cancel", False, 
            "Skipped - no customer cookies or order id")

# ============================================================================
# TEST 5: Tenant Isolation of Customer Session
# ============================================================================
print("\n[TEST 5] Tenant Isolation of Customer Session")

# Test 5.1: White Mug customer cookie with ABC Hotel host -> customer null
if customer_cookies:
    resp, err = make_request("GET", "/auth/me", host="abchotel.com", 
                            cookies=customer_cookies)
    if err:
        log_test("5.1 - White Mug customer cookie on ABC Hotel -> customer null", False, err)
    else:
        data = resp.json()
        if data.get("customer") is None:
            log_test("5.1 - White Mug customer cookie on ABC Hotel -> customer null", True)
        else:
            log_test("5.1 - White Mug customer cookie on ABC Hotel -> customer null", False, 
                    "Expected customer=null, got customer data")
else:
    log_test("5.1 - White Mug customer cookie on ABC Hotel -> customer null", False, 
            "Skipped - no customer cookies")

# Test 5.2: GET /api/orders with wrong tenant -> 401
if customer_cookies:
    resp, err = make_request("GET", "/orders", host="abchotel.com", 
                            cookies=customer_cookies, expect_status=401)
    if err:
        log_test("5.2 - White Mug customer GET /api/orders on ABC Hotel -> 401", False, err)
    else:
        log_test("5.2 - White Mug customer GET /api/orders on ABC Hotel -> 401", True)
else:
    log_test("5.2 - White Mug customer GET /api/orders on ABC Hotel -> 401", False, 
            "Skipped - no customer cookies")

# ============================================================================
# TEST 6: Admin Auth
# ============================================================================
print("\n[TEST 6] Admin Authentication")

# Test 6.1: Login with wrong password -> 401
resp, err = make_request("POST", "/admin/auth/login", host="thewhitemug.site",
                        json_data={"email": "owner@whitemug.demo", "password": "wrongpass"},
                        expect_status=401)
if err:
    log_test("6.1 - POST /admin/auth/login with wrong password -> 401", False, err)
else:
    log_test("6.1 - POST /admin/auth/login with wrong password -> 401", True)

# Test 6.2: Login with correct credentials
staff_cookies = None
resp, err = make_request("POST", "/admin/auth/login", host="thewhitemug.site",
                        json_data={"email": "owner@whitemug.demo", "password": "admin123"})
if err:
    log_test("6.2 - POST /admin/auth/login with correct credentials", False, err)
else:
    data = resp.json()
    staff_cookies = resp.cookies
    if "staff_session" in staff_cookies and data.get("user"):
        log_test("6.2 - POST /admin/auth/login with correct credentials", True)
    else:
        log_test("6.2 - POST /admin/auth/login with correct credentials", False, 
                "No staff_session cookie or user in response")

# Test 6.3: GET /admin/auth/me returns user
if staff_cookies:
    resp, err = make_request("GET", "/admin/auth/me", host="thewhitemug.site", 
                            cookies=staff_cookies)
    if err:
        log_test("6.3 - GET /admin/auth/me returns user", False, err)
    else:
        data = resp.json()
        if data.get("user"):
            log_test("6.3 - GET /admin/auth/me returns user", True)
        else:
            log_test("6.3 - GET /admin/auth/me returns user", False, 
                    "No user in response")
else:
    log_test("6.3 - GET /admin/auth/me returns user", False, 
            "Skipped - no staff cookies")

# Test 6.4: Same staff cookie with ABC Hotel host -> user null
if staff_cookies:
    resp, err = make_request("GET", "/admin/auth/me", host="abchotel.com", 
                            cookies=staff_cookies)
    if err:
        log_test("6.4 - White Mug staff cookie on ABC Hotel -> user null", False, err)
    else:
        data = resp.json()
        if data.get("user") is None:
            log_test("6.4 - White Mug staff cookie on ABC Hotel -> user null", True)
        else:
            log_test("6.4 - White Mug staff cookie on ABC Hotel -> user null", False, 
                    "Expected user=null, got user data")
else:
    log_test("6.4 - White Mug staff cookie on ABC Hotel -> user null", False, 
            "Skipped - no staff cookies")

# Test 6.5: GET /admin/orders with wrong tenant -> 401
if staff_cookies:
    resp, err = make_request("GET", "/admin/orders", host="abchotel.com", 
                            cookies=staff_cookies, expect_status=401)
    if err:
        log_test("6.5 - White Mug staff GET /admin/orders on ABC Hotel -> 401", False, err)
    else:
        log_test("6.5 - White Mug staff GET /admin/orders on ABC Hotel -> 401", True)
else:
    log_test("6.5 - White Mug staff GET /admin/orders on ABC Hotel -> 401", False, 
            "Skipped - no staff cookies")

# Test 6.6: ABC Hotel owner logging in on White Mug host -> 401
resp, err = make_request("POST", "/admin/auth/login", host="thewhitemug.site",
                        json_data={"email": "owner@abchotel.demo", "password": "admin123"},
                        expect_status=401)
if err:
    log_test("6.6 - ABC Hotel owner login on White Mug host -> 401", False, err)
else:
    log_test("6.6 - ABC Hotel owner login on White Mug host -> 401", True)

# ============================================================================
# TEST 7: Admin Orders + State Machine
# ============================================================================
print("\n[TEST 7] Admin Orders + State Machine Transitions")

# Create a fresh order for testing state transitions
test_order_id = None
if customer_cookies and signature_latte_id and large_variant_id:
    resp, err = make_request("POST", "/checkout/place", host="thewhitemug.site",
                            cookies=customer_cookies,
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "qty": 1
                                }],
                                "mode": "PICKUP",
                                "idempotency_key": f"test-key-state-{int(time.time())}",
                                "payment_method": "COD",
                                "contact": {"name": "Test", "phone": "9111122223"}
                            })
    if not err:
        test_order_id = resp.json().get("order", {}).get("id")

# Test 7.1: GET /admin/orders?scope=board
if staff_cookies:
    resp, err = make_request("GET", "/admin/orders?scope=board", host="thewhitemug.site", 
                            cookies=staff_cookies)
    if err:
        log_test("7.1 - GET /admin/orders?scope=board", False, err)
    else:
        data = resp.json()
        counts = data.get("counts", {})
        if counts.get("ORDER_PLACED", 0) >= 1:
            log_test("7.1 - GET /admin/orders?scope=board (counts.ORDER_PLACED >= 1)", True)
        else:
            log_test("7.1 - GET /admin/orders?scope=board", False, 
                    f"Expected ORDER_PLACED count >= 1, got {counts.get('ORDER_PLACED')}")
else:
    log_test("7.1 - GET /admin/orders?scope=board", False, 
            "Skipped - no staff cookies")

# Test 7.2: Invalid transition ORDER_PLACED -> READY -> 400
if staff_cookies and test_order_id:
    resp, err = make_request("PATCH", f"/admin/orders/{test_order_id}/status", 
                            host="thewhitemug.site", cookies=staff_cookies,
                            json_data={"status": "READY"}, expect_status=400)
    if err:
        log_test("7.2 - PATCH /admin/orders/:id/status ORDER_PLACED -> READY -> 400", False, err)
    else:
        log_test("7.2 - PATCH /admin/orders/:id/status ORDER_PLACED -> READY -> 400", True)
else:
    log_test("7.2 - PATCH /admin/orders/:id/status ORDER_PLACED -> READY", False, 
            "Skipped - no staff cookies or test order")

# Test 7.3: Valid transition ORDER_PLACED -> ACCEPTED
if staff_cookies and test_order_id:
    resp, err = make_request("PATCH", f"/admin/orders/{test_order_id}/status", 
                            host="thewhitemug.site", cookies=staff_cookies,
                            json_data={"status": "ACCEPTED"})
    if err:
        log_test("7.3 - PATCH /admin/orders/:id/status ORDER_PLACED -> ACCEPTED", False, err)
    else:
        data = resp.json()
        if data.get("order", {}).get("status") == "ACCEPTED":
            log_test("7.3 - PATCH /admin/orders/:id/status ORDER_PLACED -> ACCEPTED", True)
        else:
            log_test("7.3 - PATCH /admin/orders/:id/status ORDER_PLACED -> ACCEPTED", False, 
                    f"Expected status ACCEPTED, got {data.get('order', {}).get('status')}")
else:
    log_test("7.3 - PATCH /admin/orders/:id/status ORDER_PLACED -> ACCEPTED", False, 
            "Skipped - no staff cookies or test order")

# Test 7.4: ACCEPTED -> PREPARING
if staff_cookies and test_order_id:
    resp, err = make_request("PATCH", f"/admin/orders/{test_order_id}/status", 
                            host="thewhitemug.site", cookies=staff_cookies,
                            json_data={"status": "PREPARING"})
    if err:
        log_test("7.4 - PATCH /admin/orders/:id/status ACCEPTED -> PREPARING", False, err)
    else:
        log_test("7.4 - PATCH /admin/orders/:id/status ACCEPTED -> PREPARING", True)
else:
    log_test("7.4 - PATCH /admin/orders/:id/status ACCEPTED -> PREPARING", False, 
            "Skipped - no staff cookies or test order")

# Test 7.5: PREPARING -> READY
if staff_cookies and test_order_id:
    resp, err = make_request("PATCH", f"/admin/orders/{test_order_id}/status", 
                            host="thewhitemug.site", cookies=staff_cookies,
                            json_data={"status": "READY"})
    if err:
        log_test("7.5 - PATCH /admin/orders/:id/status PREPARING -> READY", False, err)
    else:
        log_test("7.5 - PATCH /admin/orders/:id/status PREPARING -> READY", True)
else:
    log_test("7.5 - PATCH /admin/orders/:id/status PREPARING -> READY", False, 
            "Skipped - no staff cookies or test order")

# Test 7.6: READY -> OUT_FOR_DELIVERY on PICKUP order -> 400
if staff_cookies and test_order_id:
    resp, err = make_request("PATCH", f"/admin/orders/{test_order_id}/status", 
                            host="thewhitemug.site", cookies=staff_cookies,
                            json_data={"status": "OUT_FOR_DELIVERY"}, expect_status=400)
    if err:
        log_test("7.6 - PATCH READY -> OUT_FOR_DELIVERY on PICKUP order -> 400", False, err)
    else:
        log_test("7.6 - PATCH READY -> OUT_FOR_DELIVERY on PICKUP order -> 400", True)
else:
    log_test("7.6 - PATCH READY -> OUT_FOR_DELIVERY on PICKUP order", False, 
            "Skipped - no staff cookies or test order")

# Test 7.7: READY -> DELIVERED on PICKUP order
if staff_cookies and test_order_id:
    resp, err = make_request("PATCH", f"/admin/orders/{test_order_id}/status", 
                            host="thewhitemug.site", cookies=staff_cookies,
                            json_data={"status": "DELIVERED"})
    if err:
        log_test("7.7 - PATCH /admin/orders/:id/status READY -> DELIVERED", False, err)
    else:
        data = resp.json()
        order = data.get("order", {})
        if order.get("status") == "DELIVERED" and order.get("payment_status") == "PAID":
            log_test("7.7 - PATCH READY -> DELIVERED (payment_status=PAID)", True)
        else:
            log_test("7.7 - PATCH READY -> DELIVERED", False, 
                    f"Expected status=DELIVERED and payment_status=PAID, got status={order.get('status')}, payment_status={order.get('payment_status')}")
else:
    log_test("7.7 - PATCH READY -> DELIVERED", False, 
            "Skipped - no staff cookies or test order")

# Test 7.8: DELIVERED -> PREPARING -> 400 (cannot go backwards)
if staff_cookies and test_order_id:
    resp, err = make_request("PATCH", f"/admin/orders/{test_order_id}/status", 
                            host="thewhitemug.site", cookies=staff_cookies,
                            json_data={"status": "PREPARING"}, expect_status=400)
    if err:
        log_test("7.8 - PATCH DELIVERED -> PREPARING -> 400", False, err)
    else:
        log_test("7.8 - PATCH DELIVERED -> PREPARING -> 400", True)
else:
    log_test("7.8 - PATCH DELIVERED -> PREPARING", False, 
            "Skipped - no staff cookies or test order")

# Test 7.9: Create another order and REJECT without reason -> 400
test_order_id2 = None
if customer_cookies and signature_latte_id and large_variant_id:
    resp, err = make_request("POST", "/checkout/place", host="thewhitemug.site",
                            cookies=customer_cookies,
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "qty": 1
                                }],
                                "mode": "PICKUP",
                                "idempotency_key": f"test-key-reject-{int(time.time())}",
                                "payment_method": "COD",
                                "contact": {"name": "Test", "phone": "9111122223"}
                            })
    if not err:
        test_order_id2 = resp.json().get("order", {}).get("id")

if staff_cookies and test_order_id2:
    resp, err = make_request("PATCH", f"/admin/orders/{test_order_id2}/status", 
                            host="thewhitemug.site", cookies=staff_cookies,
                            json_data={"status": "REJECTED"}, expect_status=400)
    if err:
        log_test("7.9 - PATCH status=REJECTED without reason -> 400", False, err)
    else:
        log_test("7.9 - PATCH status=REJECTED without reason -> 400", True)
else:
    log_test("7.9 - PATCH status=REJECTED without reason", False, 
            "Skipped - no staff cookies or test order")

# Test 7.10: REJECT with reason
if staff_cookies and test_order_id2:
    resp, err = make_request("PATCH", f"/admin/orders/{test_order_id2}/status", 
                            host="thewhitemug.site", cookies=staff_cookies,
                            json_data={"status": "REJECTED", "reason": "Item unavailable"})
    if err:
        log_test("7.10 - PATCH status=REJECTED with reason", False, err)
    else:
        data = resp.json()
        order = data.get("order", {})
        if (order.get("status") == "REJECTED" and 
            order.get("rejection_reason") == "Item unavailable" and
            order.get("payment_status") == "VOID"):
            log_test("7.10 - PATCH status=REJECTED with reason (payment_status=VOID)", True)
        else:
            log_test("7.10 - PATCH status=REJECTED with reason", False, 
                    f"Expected status=REJECTED, rejection_reason set, payment_status=VOID")
else:
    log_test("7.10 - PATCH status=REJECTED with reason", False, 
            "Skipped - no staff cookies or test order")

# Test 7.11: GET /admin/orders/:id returns order + customer + allowed_transitions
if staff_cookies and test_order_id:
    resp, err = make_request("GET", f"/admin/orders/{test_order_id}", 
                            host="thewhitemug.site", cookies=staff_cookies)
    if err:
        log_test("7.11 - GET /admin/orders/:id returns order + customer + allowed_transitions", False, err)
    else:
        data = resp.json()
        if (data.get("order") and data.get("customer") and 
            "allowed_transitions" in data):
            log_test("7.11 - GET /admin/orders/:id returns order + customer + allowed_transitions", True)
        else:
            log_test("7.11 - GET /admin/orders/:id", False, 
                    "Missing order, customer, or allowed_transitions")
else:
    log_test("7.11 - GET /admin/orders/:id", False, 
            "Skipped - no staff cookies or test order")

# Test 7.12: POST /admin/orders/:id/notes
if staff_cookies and test_order_id:
    resp, err = make_request("POST", f"/admin/orders/{test_order_id}/notes", 
                            host="thewhitemug.site", cookies=staff_cookies,
                            json_data={"note": "Test internal note"})
    if err:
        log_test("7.12 - POST /admin/orders/:id/notes", False, err)
    else:
        data = resp.json()
        order = data.get("order", {})
        notes = order.get("internal_notes", [])
        if notes and any("Test internal note" in n.get("note", "") for n in notes):
            log_test("7.12 - POST /admin/orders/:id/notes adds internal note", True)
        else:
            log_test("7.12 - POST /admin/orders/:id/notes", False, 
                    "Note not found in internal_notes")
else:
    log_test("7.12 - POST /admin/orders/:id/notes", False, 
            "Skipped - no staff cookies or test order")

# Test 7.13: Kitchen role login
kitchen_cookies = None
resp, err = make_request("POST", "/admin/auth/login", host="thewhitemug.site",
                        json_data={"email": "kitchen@whitemug.demo", "password": "kitchen123"})
if err:
    log_test("7.13 - Kitchen role login", False, err)
else:
    kitchen_cookies = resp.cookies
    if "staff_session" in kitchen_cookies:
        log_test("7.13 - Kitchen role login", True)
    else:
        log_test("7.13 - Kitchen role login", False, "No staff_session cookie")

# Test 7.14: Kitchen role PATCH status DELIVERED -> 400
test_order_id3 = None
if customer_cookies and signature_latte_id and large_variant_id:
    resp, err = make_request("POST", "/checkout/place", host="thewhitemug.site",
                            cookies=customer_cookies,
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "qty": 1
                                }],
                                "mode": "PICKUP",
                                "idempotency_key": f"test-key-kitchen-{int(time.time())}",
                                "payment_method": "COD",
                                "contact": {"name": "Test", "phone": "9111122223"}
                            })
    if not err:
        test_order_id3 = resp.json().get("order", {}).get("id")
        # Transition to READY first
        if staff_cookies:
            make_request("PATCH", f"/admin/orders/{test_order_id3}/status", 
                        host="thewhitemug.site", cookies=staff_cookies,
                        json_data={"status": "ACCEPTED"})
            make_request("PATCH", f"/admin/orders/{test_order_id3}/status", 
                        host="thewhitemug.site", cookies=staff_cookies,
                        json_data={"status": "PREPARING"})
            make_request("PATCH", f"/admin/orders/{test_order_id3}/status", 
                        host="thewhitemug.site", cookies=staff_cookies,
                        json_data={"status": "READY"})

if kitchen_cookies and test_order_id3:
    resp, err = make_request("PATCH", f"/admin/orders/{test_order_id3}/status", 
                            host="thewhitemug.site", cookies=kitchen_cookies,
                            json_data={"status": "DELIVERED"}, expect_status=400)
    if err:
        log_test("7.14 - Kitchen role PATCH status DELIVERED -> 400", False, err)
    else:
        log_test("7.14 - Kitchen role PATCH status DELIVERED -> 400", True)
else:
    log_test("7.14 - Kitchen role PATCH status DELIVERED", False, 
            "Skipped - no kitchen cookies or test order")

# Test 7.15: Kitchen role can ACCEPT/PREPARING
test_order_id4 = None
if customer_cookies and signature_latte_id and large_variant_id:
    resp, err = make_request("POST", "/checkout/place", host="thewhitemug.site",
                            cookies=customer_cookies,
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "qty": 1
                                }],
                                "mode": "PICKUP",
                                "idempotency_key": f"test-key-kitchen2-{int(time.time())}",
                                "payment_method": "COD",
                                "contact": {"name": "Test", "phone": "9111122223"}
                            })
    if not err:
        test_order_id4 = resp.json().get("order", {}).get("id")

if kitchen_cookies and test_order_id4:
    resp, err = make_request("PATCH", f"/admin/orders/{test_order_id4}/status", 
                            host="thewhitemug.site", cookies=kitchen_cookies,
                            json_data={"status": "ACCEPTED"})
    if err:
        log_test("7.15 - Kitchen role can ACCEPT", False, err)
    else:
        resp2, err2 = make_request("PATCH", f"/admin/orders/{test_order_id4}/status", 
                                  host="thewhitemug.site", cookies=kitchen_cookies,
                                  json_data={"status": "PREPARING"})
        if err2:
            log_test("7.15 - Kitchen role can ACCEPT/PREPARING", False, err2)
        else:
            log_test("7.15 - Kitchen role can ACCEPT/PREPARING", True)
else:
    log_test("7.15 - Kitchen role can ACCEPT/PREPARING", False, 
            "Skipped - no kitchen cookies or test order")

# Test 7.16: Delivery role GET /admin/orders
delivery_cookies = None
resp, err = make_request("POST", "/admin/auth/login", host="thewhitemug.site",
                        json_data={"email": "rider@whitemug.demo", "password": "kitchen123"})
if not err:
    delivery_cookies = resp.cookies

if delivery_cookies:
    resp, err = make_request("GET", "/admin/orders", host="thewhitemug.site", 
                            cookies=delivery_cookies)
    if err:
        log_test("7.16 - Delivery role GET /admin/orders", False, err)
    else:
        log_test("7.16 - Delivery role GET /admin/orders", True)
else:
    log_test("7.16 - Delivery role GET /admin/orders", False, 
            "Skipped - no delivery cookies")

# Test 7.17: PATCH /admin/orders/:id/assign (create DELIVERY order first)
delivery_order_id = None
if customer_cookies and signature_latte_id and large_variant_id:
    resp, err = make_request("POST", "/checkout/place", host="thewhitemug.site",
                            cookies=customer_cookies,
                            json_data={
                                "items": [{
                                    "product_id": signature_latte_id,
                                    "variant_id": large_variant_id,
                                    "qty": 1
                                }],
                                "mode": "DELIVERY",
                                "address": {"line1": "123 Test St", "city": "Mumbai", "pincode": "400001"},
                                "idempotency_key": f"test-key-delivery-assign-{int(time.time())}",
                                "payment_method": "COD",
                                "contact": {"name": "Test", "phone": "9111122223"}
                            })
    if not err:
        delivery_order_id = resp.json().get("order", {}).get("id")

# Get rider id from staff list
rider_id = None
if staff_cookies:
    resp, err = make_request("GET", "/admin/staff", host="thewhitemug.site", 
                            cookies=staff_cookies)
    if not err:
        staff_list = resp.json().get("staff", [])
        rider = next((s for s in staff_list if s.get("role") == "delivery"), None)
        if rider:
            rider_id = rider.get("id")

if staff_cookies and delivery_order_id and rider_id:
    resp, err = make_request("PATCH", f"/admin/orders/{delivery_order_id}/assign", 
                            host="thewhitemug.site", cookies=staff_cookies,
                            json_data={"staff_user_id": rider_id})
    if err:
        log_test("7.17 - PATCH /admin/orders/:id/assign", False, err)
    else:
        data = resp.json()
        order = data.get("order", {})
        if order.get("delivery_assignee_id") == rider_id and order.get("delivery_assignee_name"):
            log_test("7.17 - PATCH /admin/orders/:id/assign sets delivery_assignee", True)
        else:
            log_test("7.17 - PATCH /admin/orders/:id/assign", False, 
                    "delivery_assignee not set correctly")
else:
    log_test("7.17 - PATCH /admin/orders/:id/assign", False, 
            "Skipped - no staff cookies, delivery order, or rider id")

# ============================================================================
# TEST 8: Admin Menu CRUD
# ============================================================================
print("\n[TEST 8] Admin Menu CRUD")

# Test 8.1: POST /admin/categories
test_category_id = None
if staff_cookies:
    resp, err = make_request("POST", "/admin/categories", host="thewhitemug.site",
                            cookies=staff_cookies,
                            json_data={"name": "Test Category"})
    if err:
        log_test("8.1 - POST /admin/categories", False, err)
    else:
        data = resp.json()
        test_category_id = data.get("category", {}).get("id")
        if test_category_id:
            log_test("8.1 - POST /admin/categories", True)
        else:
            log_test("8.1 - POST /admin/categories", False, "No category id in response")
else:
    log_test("8.1 - POST /admin/categories", False, "Skipped - no staff cookies")

# Test 8.2: POST /admin/products
test_product_id = None
if staff_cookies and test_category_id:
    resp, err = make_request("POST", "/admin/products", host="thewhitemug.site",
                            cookies=staff_cookies,
                            json_data={
                                "name": "Test Item",
                                "category_id": test_category_id,
                                "base_price": 100,
                                "variants": [
                                    {"name": "S", "price": 90},
                                    {"name": "L", "price": 120}
                                ],
                                "addons": [
                                    {"name": "Cheese", "price": 20}
                                ]
                            })
    if err:
        log_test("8.2 - POST /admin/products with variants and addons", False, err)
    else:
        data = resp.json()
        product = data.get("product", {})
        test_product_id = product.get("id")
        variants = product.get("variants", [])
        addons = product.get("addons", [])
        if test_product_id and len(variants) == 2 and len(addons) == 1:
            # Check that variant ids are generated
            if all(v.get("id") for v in variants):
                log_test("8.2 - POST /admin/products with variants and addons (ids generated)", True)
            else:
                log_test("8.2 - POST /admin/products", False, "Variant ids not generated")
        else:
            log_test("8.2 - POST /admin/products", False, 
                    f"Expected 2 variants and 1 addon, got {len(variants)} variants and {len(addons)} addons")
else:
    log_test("8.2 - POST /admin/products", False, 
            "Skipped - no staff cookies or category id")

# Test 8.3: PATCH /admin/products/:id
if staff_cookies and test_product_id:
    resp, err = make_request("PATCH", f"/admin/products/{test_product_id}", 
                            host="thewhitemug.site", cookies=staff_cookies,
                            json_data={"base_price": 110})
    if err:
        log_test("8.3 - PATCH /admin/products/:id", False, err)
    else:
        data = resp.json()
        if data.get("product", {}).get("base_price") == 110:
            log_test("8.3 - PATCH /admin/products/:id updates base_price", True)
        else:
            log_test("8.3 - PATCH /admin/products/:id", False, 
                    f"Expected base_price=110, got {data.get('product', {}).get('base_price')}")
else:
    log_test("8.3 - PATCH /admin/products/:id", False, 
            "Skipped - no staff cookies or product id")

# Test 8.4: PATCH /admin/products/:id/availability
if staff_cookies and test_product_id:
    resp, err = make_request("PATCH", f"/admin/products/{test_product_id}/availability", 
                            host="thewhitemug.site", cookies=staff_cookies,
                            json_data={"is_available": False})
    if err:
        log_test("8.4 - PATCH /admin/products/:id/availability", False, err)
    else:
        # Check that GET /api/menu shows it as unavailable
        resp2, err2 = make_request("GET", "/menu", host="thewhitemug.site")
        if err2:
            log_test("8.4 - PATCH /admin/products/:id/availability", False, err2)
        else:
            menu_data = resp2.json()
            products = menu_data.get("products", [])
            test_product = next((p for p in products if p.get("id") == test_product_id), None)
            if test_product and test_product.get("is_available") == False:
                log_test("8.4 - PATCH /admin/products/:id/availability (is_available=false in menu)", True)
            else:
                log_test("8.4 - PATCH /admin/products/:id/availability", False, 
                        "Product not found in menu or is_available not false")
else:
    log_test("8.4 - PATCH /admin/products/:id/availability", False, 
            "Skipped - no staff cookies or product id")

# Test 8.5: DELETE /admin/products/:id (soft delete)
if staff_cookies and test_product_id:
    resp, err = make_request("DELETE", f"/admin/products/{test_product_id}", 
                            host="thewhitemug.site", cookies=staff_cookies)
    if err:
        log_test("8.5 - DELETE /admin/products/:id (soft delete)", False, err)
    else:
        # Check that GET /api/menu does not show it
        resp2, err2 = make_request("GET", "/menu", host="thewhitemug.site")
        if err2:
            log_test("8.5 - DELETE /admin/products/:id", False, err2)
        else:
            menu_data = resp2.json()
            products = menu_data.get("products", [])
            test_product = next((p for p in products if p.get("id") == test_product_id), None)
            if test_product is None:
                log_test("8.5 - DELETE /admin/products/:id (not in menu after delete)", True)
            else:
                log_test("8.5 - DELETE /admin/products/:id", False, 
                        "Product still in menu after delete")
else:
    log_test("8.5 - DELETE /admin/products/:id", False, 
            "Skipped - no staff cookies or product id")

# Test 8.6: DELETE category with products -> 400
# First, create a new category and product
test_category_id2 = None
test_product_id2 = None
if staff_cookies:
    resp, err = make_request("POST", "/admin/categories", host="thewhitemug.site",
                            cookies=staff_cookies,
                            json_data={"name": "Test Category 2"})
    if not err:
        test_category_id2 = resp.json().get("category", {}).get("id")
        if test_category_id2:
            resp2, err2 = make_request("POST", "/admin/products", host="thewhitemug.site",
                                      cookies=staff_cookies,
                                      json_data={
                                          "name": "Test Item 2",
                                          "category_id": test_category_id2,
                                          "base_price": 100
                                      })
            if not err2:
                test_product_id2 = resp2.json().get("product", {}).get("id")

if staff_cookies and test_category_id2 and test_product_id2:
    resp, err = make_request("DELETE", f"/admin/categories/{test_category_id2}", 
                            host="thewhitemug.site", cookies=staff_cookies,
                            expect_status=400)
    if err:
        log_test("8.6 - DELETE category with products -> 400", False, err)
    else:
        log_test("8.6 - DELETE category with products -> 400", True)
else:
    log_test("8.6 - DELETE category with products -> 400", False, 
            "Skipped - could not create category and product")

# Test 8.7: After deleting product, DELETE category succeeds
if staff_cookies and test_category_id2 and test_product_id2:
    # Delete the product first
    resp, err = make_request("DELETE", f"/admin/products/{test_product_id2}", 
                            host="thewhitemug.site", cookies=staff_cookies)
    if not err:
        # Now delete the category
        resp2, err2 = make_request("DELETE", f"/admin/categories/{test_category_id2}", 
                                  host="thewhitemug.site", cookies=staff_cookies)
        if err2:
            log_test("8.7 - DELETE category after deleting products", False, err2)
        else:
            log_test("8.7 - DELETE category after deleting products", True)
    else:
        log_test("8.7 - DELETE category after deleting products", False, 
                "Could not delete product first")
else:
    log_test("8.7 - DELETE category after deleting products", False, 
            "Skipped - no category or product")

# Test 8.8: Kitchen role POST /admin/products -> 403
if kitchen_cookies and test_category_id:
    resp, err = make_request("POST", "/admin/products", host="thewhitemug.site",
                            cookies=kitchen_cookies,
                            json_data={
                                "name": "Test Item Kitchen",
                                "category_id": test_category_id,
                                "base_price": 100
                            }, expect_status=403)
    if err:
        log_test("8.8 - Kitchen role POST /admin/products -> 403", False, err)
    else:
        log_test("8.8 - Kitchen role POST /admin/products -> 403", True)
else:
    log_test("8.8 - Kitchen role POST /admin/products -> 403", False, 
            "Skipped - no kitchen cookies or category id")

# Test 8.9: Kitchen role PATCH availability -> 200
# Create a product first
test_product_id3 = None
if staff_cookies and test_category_id:
    resp, err = make_request("POST", "/admin/products", host="thewhitemug.site",
                            cookies=staff_cookies,
                            json_data={
                                "name": "Test Item 3",
                                "category_id": test_category_id,
                                "base_price": 100
                            })
    if not err:
        test_product_id3 = resp.json().get("product", {}).get("id")

if kitchen_cookies and test_product_id3:
    resp, err = make_request("PATCH", f"/admin/products/{test_product_id3}/availability", 
                            host="thewhitemug.site", cookies=kitchen_cookies,
                            json_data={"is_available": False})
    if err:
        log_test("8.9 - Kitchen role PATCH availability -> 200", False, err)
    else:
        log_test("8.9 - Kitchen role PATCH availability -> 200", True)
else:
    log_test("8.9 - Kitchen role PATCH availability -> 200", False, 
            "Skipped - no kitchen cookies or product id")

# Test 8.10: POST /admin/categories/reorder
if staff_cookies:
    # Get current categories
    resp, err = make_request("GET", "/admin/categories", host="thewhitemug.site", 
                            cookies=staff_cookies)
    if not err:
        categories = resp.json().get("categories", [])
        cat_ids = [c.get("id") for c in categories]
        if len(cat_ids) >= 2:
            # Reverse the order
            cat_ids.reverse()
            resp2, err2 = make_request("POST", "/admin/categories/reorder", 
                                      host="thewhitemug.site", cookies=staff_cookies,
                                      json_data={"ids": cat_ids})
            if err2:
                log_test("8.10 - POST /admin/categories/reorder", False, err2)
            else:
                log_test("8.10 - POST /admin/categories/reorder", True)
        else:
            log_test("8.10 - POST /admin/categories/reorder", False, 
                    "Not enough categories to reorder")
    else:
        log_test("8.10 - POST /admin/categories/reorder", False, 
                "Could not get categories")
else:
    log_test("8.10 - POST /admin/categories/reorder", False, 
            "Skipped - no staff cookies")

# ============================================================================
# TEST 9: CRM/Coupons/Reports/Dashboard/Settings
# ============================================================================
print("\n[TEST 9] CRM, Coupons, Reports, Dashboard, Settings")

# Test 9.1: GET /admin/customers
if staff_cookies:
    resp, err = make_request("GET", "/admin/customers", host="thewhitemug.site", 
                            cookies=staff_cookies)
    if err:
        log_test("9.1 - GET /admin/customers returns customers with stats+segment+metrics", False, err)
    else:
        data = resp.json()
        customers = data.get("customers", [])
        metrics = data.get("metrics", {})
        if customers and metrics and "segments" in metrics:
            # Check that customers have stats and segment
            if all(c.get("stats") and c.get("segment") for c in customers[:3]):
                log_test("9.1 - GET /admin/customers returns customers with stats+segment+metrics", True)
            else:
                log_test("9.1 - GET /admin/customers", False, 
                        "Customers missing stats or segment")
        else:
            log_test("9.1 - GET /admin/customers", False, 
                    "Missing customers or metrics")
else:
    log_test("9.1 - GET /admin/customers", False, "Skipped - no staff cookies")

# Test 9.2: GET /admin/customers?segment=VIP
if staff_cookies:
    resp, err = make_request("GET", "/admin/customers?segment=VIP", host="thewhitemug.site", 
                            cookies=staff_cookies)
    if err:
        log_test("9.2 - GET /admin/customers?segment=VIP filters", False, err)
    else:
        data = resp.json()
        customers = data.get("customers", [])
        if all(c.get("segment") == "VIP" for c in customers):
            log_test("9.2 - GET /admin/customers?segment=VIP filters", True)
        else:
            log_test("9.2 - GET /admin/customers?segment=VIP", False, 
                    "Not all customers are VIP segment")
else:
    log_test("9.2 - GET /admin/customers?segment=VIP", False, "Skipped - no staff cookies")

# Test 9.3: GET /admin/customers/:id returns favorites+orders
if staff_cookies and customer_cookies:
    # Get customer id from auth/me
    resp, err = make_request("GET", "/auth/me", host="thewhitemug.site", 
                            cookies=customer_cookies)
    if not err:
        customer_id = resp.json().get("customer", {}).get("id")
        if customer_id:
            resp2, err2 = make_request("GET", f"/admin/customers/{customer_id}", 
                                      host="thewhitemug.site", cookies=staff_cookies)
            if err2:
                log_test("9.3 - GET /admin/customers/:id returns favorites+orders", False, err2)
            else:
                data = resp2.json()
                customer = data.get("customer", {})
                orders = data.get("orders", [])
                if "favorites" in customer and orders is not None:
                    log_test("9.3 - GET /admin/customers/:id returns favorites+orders", True)
                else:
                    log_test("9.3 - GET /admin/customers/:id", False, 
                            "Missing favorites or orders")
        else:
            log_test("9.3 - GET /admin/customers/:id", False, "Could not get customer id")
    else:
        log_test("9.3 - GET /admin/customers/:id", False, "Could not get customer")
else:
    log_test("9.3 - GET /admin/customers/:id", False, "Skipped - no staff or customer cookies")

# Test 9.4: POST /admin/coupons
test_coupon_id = None
if staff_cookies:
    resp, err = make_request("POST", "/admin/coupons", host="thewhitemug.site",
                            cookies=staff_cookies,
                            json_data={
                                "code": "test20",
                                "type": "PERCENT",
                                "value": 20,
                                "min_order": 100
                            })
    if err:
        log_test("9.4 - POST /admin/coupons (code uppercased to TEST20)", False, err)
    else:
        data = resp.json()
        coupon = data.get("coupon", {})
        test_coupon_id = coupon.get("id")
        if coupon.get("code") == "TEST20":
            log_test("9.4 - POST /admin/coupons (code uppercased to TEST20)", True)
        else:
            log_test("9.4 - POST /admin/coupons", False, 
                    f"Expected code TEST20, got {coupon.get('code')}")
else:
    log_test("9.4 - POST /admin/coupons", False, "Skipped - no staff cookies")

# Test 9.5: Duplicate coupon code -> 400
if staff_cookies:
    resp, err = make_request("POST", "/admin/coupons", host="thewhitemug.site",
                            cookies=staff_cookies,
                            json_data={
                                "code": "TEST20",
                                "type": "PERCENT",
                                "value": 20,
                                "min_order": 100
                            }, expect_status=400)
    if err:
        log_test("9.5 - POST /admin/coupons duplicate code -> 400", False, err)
    else:
        log_test("9.5 - POST /admin/coupons duplicate code -> 400", True)
else:
    log_test("9.5 - POST /admin/coupons duplicate code", False, "Skipped - no staff cookies")

# Test 9.6: Percent value > 100 -> 400
if staff_cookies:
    resp, err = make_request("POST", "/admin/coupons", host="thewhitemug.site",
                            cookies=staff_cookies,
                            json_data={
                                "code": "INVALID150",
                                "type": "PERCENT",
                                "value": 150,
                                "min_order": 100
                            }, expect_status=400)
    if err:
        log_test("9.6 - POST /admin/coupons value 150 percent -> 400", False, err)
    else:
        log_test("9.6 - POST /admin/coupons value 150 percent -> 400", True)
else:
    log_test("9.6 - POST /admin/coupons value 150 percent", False, "Skipped - no staff cookies")

# Test 9.7: PATCH coupon is_active false
if staff_cookies and test_coupon_id:
    resp, err = make_request("PATCH", f"/admin/coupons/{test_coupon_id}", 
                            host="thewhitemug.site", cookies=staff_cookies,
                            json_data={"is_active": False})
    if err:
        log_test("9.7 - PATCH /admin/coupons/:id is_active=false", False, err)
    else:
        log_test("9.7 - PATCH /admin/coupons/:id is_active=false", True)
else:
    log_test("9.7 - PATCH /admin/coupons/:id is_active=false", False, 
            "Skipped - no staff cookies or coupon id")

# Test 9.8: DELETE coupon
if staff_cookies and test_coupon_id:
    resp, err = make_request("DELETE", f"/admin/coupons/{test_coupon_id}", 
                            host="thewhitemug.site", cookies=staff_cookies)
    if err:
        log_test("9.8 - DELETE /admin/coupons/:id", False, err)
    else:
        log_test("9.8 - DELETE /admin/coupons/:id", True)
else:
    log_test("9.8 - DELETE /admin/coupons/:id", False, 
            "Skipped - no staff cookies or coupon id")

# Test 9.9: GET /admin/reports?range=7d
if staff_cookies:
    resp, err = make_request("GET", "/admin/reports?range=7d", host="thewhitemug.site", 
                            cookies=staff_cookies)
    if err:
        log_test("9.9 - GET /admin/reports?range=7d returns totals/series/top_items", False, err)
    else:
        data = resp.json()
        if ("totals" in data and "series" in data and "top_items" in data):
            log_test("9.9 - GET /admin/reports?range=7d returns totals/series/top_items", True)
        else:
            log_test("9.9 - GET /admin/reports?range=7d", False, 
                    "Missing totals, series, or top_items")
else:
    log_test("9.9 - GET /admin/reports?range=7d", False, "Skipped - no staff cookies")

# Test 9.10: GET /admin/dashboard
if staff_cookies:
    resp, err = make_request("GET", "/admin/dashboard", host="thewhitemug.site", 
                            cookies=staff_cookies)
    if err:
        log_test("9.10 - GET /admin/dashboard returns today/live/series/top_products", False, err)
    else:
        data = resp.json()
        if ("today" in data and "live" in data and "series" in data and "top_products" in data):
            log_test("9.10 - GET /admin/dashboard returns today/live/series/top_products", True)
        else:
            log_test("9.10 - GET /admin/dashboard", False, 
                    "Missing today, live, series, or top_products")
else:
    log_test("9.10 - GET /admin/dashboard", False, "Skipped - no staff cookies")

# Test 9.11: GET /admin/settings (payment_settings.razorpay with key_secret_set boolean)
if staff_cookies:
    resp, err = make_request("GET", "/admin/settings", host="thewhitemug.site", 
                            cookies=staff_cookies)
    if err:
        log_test("9.11 - GET /admin/settings (payment_settings.razorpay.key_secret_set boolean)", False, err)
    else:
        data = resp.json()
        settings = data.get("settings", {})
        payment_settings = settings.get("payment_settings", {})
        razorpay = payment_settings.get("razorpay", {})
        if "key_secret_set" in razorpay and isinstance(razorpay.get("key_secret_set"), bool):
            # Make sure key_secret is NOT in response
            if "key_secret" not in razorpay:
                log_test("9.11 - GET /admin/settings (razorpay.key_secret_set boolean, no key_secret)", True)
            else:
                log_test("9.11 - GET /admin/settings", False, 
                        "key_secret should not be in response")
        else:
            log_test("9.11 - GET /admin/settings", False, 
                    "Missing key_secret_set or not boolean")
else:
    log_test("9.11 - GET /admin/settings", False, "Skipped - no staff cookies")

# Test 9.12: PATCH /admin/settings with invalid primary_color -> 400
if staff_cookies:
    resp, err = make_request("PATCH", "/admin/settings", host="thewhitemug.site",
                            cookies=staff_cookies,
                            json_data={"primary_color": "red"}, expect_status=400)
    if err:
        log_test("9.12 - PATCH /admin/settings primary_color='red' -> 400", False, err)
    else:
        log_test("9.12 - PATCH /admin/settings primary_color='red' -> 400", True)
else:
    log_test("9.12 - PATCH /admin/settings invalid color", False, "Skipped - no staff cookies")

# Test 9.13: PATCH /admin/settings with valid hex color and tagline
if staff_cookies:
    resp, err = make_request("PATCH", "/admin/settings", host="thewhitemug.site",
                            cookies=staff_cookies,
                            json_data={
                                "primary_color": "#123456",
                                "tagline": "New tagline"
                            })
    if err:
        log_test("9.13 - PATCH /admin/settings with valid hex color and tagline", False, err)
    else:
        # Verify with GET /api/tenant
        resp2, err2 = make_request("GET", "/tenant", host="thewhitemug.site")
        if err2:
            log_test("9.13 - PATCH /admin/settings", False, err2)
        else:
            tenant = resp2.json().get("tenant", {})
            if tenant.get("primary_color") == "#123456" and tenant.get("tagline") == "New tagline":
                # Restore original values
                make_request("PATCH", "/admin/settings", host="thewhitemug.site",
                           cookies=staff_cookies,
                           json_data={
                               "primary_color": "#1F6F5F",
                               "tagline": "Specialty coffee, fresh bakes & honest food"
                           })
                log_test("9.13 - PATCH /admin/settings with valid hex color and tagline", True)
            else:
                log_test("9.13 - PATCH /admin/settings", False, 
                        "Settings not updated correctly")
else:
    log_test("9.13 - PATCH /admin/settings", False, "Skipped - no staff cookies")

# Test 9.14: PATCH /admin/settings ordering_modes=[] -> 400
if staff_cookies:
    resp, err = make_request("PATCH", "/admin/settings", host="thewhitemug.site",
                            cookies=staff_cookies,
                            json_data={"ordering_modes": []}, expect_status=400)
    if err:
        log_test("9.14 - PATCH /admin/settings ordering_modes=[] -> 400", False, err)
    else:
        log_test("9.14 - PATCH /admin/settings ordering_modes=[] -> 400", True)
else:
    log_test("9.14 - PATCH /admin/settings ordering_modes=[]", False, "Skipped - no staff cookies")

# Test 9.15: PATCH /admin/settings payment_settings.razorpay.enabled=true without keys -> 400
if staff_cookies:
    resp, err = make_request("PATCH", "/admin/settings", host="thewhitemug.site",
                            cookies=staff_cookies,
                            json_data={
                                "payment_settings": {
                                    "razorpay": {
                                        "enabled": True
                                    }
                                }
                            }, expect_status=400)
    if err:
        log_test("9.15 - PATCH /admin/settings razorpay.enabled=true without keys -> 400", False, err)
    else:
        log_test("9.15 - PATCH /admin/settings razorpay.enabled=true without keys -> 400", True)
else:
    log_test("9.15 - PATCH /admin/settings razorpay without keys", False, "Skipped - no staff cookies")

# ============================================================================
# TEST 10: Platform Super Admin
# ============================================================================
print("\n[TEST 10] Platform Super Admin")

# Test 10.1: Login with wrong credentials -> 401
resp, err = make_request("POST", "/platform/auth/login", host="localhost",
                        json_data={"email": "admin@platform.demo", "password": "wrongpass"},
                        expect_status=401)
if err:
    log_test("10.1 - POST /platform/auth/login wrong credentials -> 401", False, err)
else:
    log_test("10.1 - POST /platform/auth/login wrong credentials -> 401", True)

# Test 10.2: Login with correct credentials
platform_cookies = None
resp, err = make_request("POST", "/platform/auth/login", host="localhost",
                        json_data={"email": "admin@platform.demo", "password": "super123"})
if err:
    log_test("10.2 - POST /platform/auth/login with correct credentials", False, err)
else:
    data = resp.json()
    platform_cookies = resp.cookies
    if "platform_session" in platform_cookies and data.get("user"):
        log_test("10.2 - POST /platform/auth/login with correct credentials", True)
    else:
        log_test("10.2 - POST /platform/auth/login", False, 
                "No platform_session cookie or user in response")

# Test 10.3: GET /platform/overview
if platform_cookies:
    resp, err = make_request("GET", "/platform/overview", host="localhost", 
                            cookies=platform_cookies)
    if err:
        log_test("10.3 - GET /platform/overview", False, err)
    else:
        data = resp.json()
        if "tenants" in data and "active_tenants" in data:
            log_test("10.3 - GET /platform/overview", True)
        else:
            log_test("10.3 - GET /platform/overview", False, 
                    "Missing tenants or active_tenants")
else:
    log_test("10.3 - GET /platform/overview", False, "Skipped - no platform cookies")

# Test 10.4: GET /platform/tenants (2 tenants with domains & stats)
if platform_cookies:
    resp, err = make_request("GET", "/platform/tenants", host="localhost", 
                            cookies=platform_cookies)
    if err:
        log_test("10.4 - GET /platform/tenants (2 tenants with domains & stats)", False, err)
    else:
        data = resp.json()
        tenants = data.get("tenants", [])
        if len(tenants) >= 2:
            # Check that tenants have domains and stats
            if all(t.get("domains") is not None and t.get("stats") for t in tenants[:2]):
                log_test("10.4 - GET /platform/tenants (2 tenants with domains & stats)", True)
            else:
                log_test("10.4 - GET /platform/tenants", False, 
                        "Tenants missing domains or stats")
        else:
            log_test("10.4 - GET /platform/tenants", False, 
                    f"Expected at least 2 tenants, got {len(tenants)}")
else:
    log_test("10.4 - GET /platform/tenants", False, "Skipped - no platform cookies")

# Test 10.5: POST /platform/tenants (create new tenant)
new_tenant_id = None
new_domain_id = None
if platform_cookies:
    resp, err = make_request("POST", "/platform/tenants", host="localhost",
                            cookies=platform_cookies,
                            json_data={
                                "business_name": "Cafe XYZ",
                                "business_type": "CAFE",
                                "owner_name": "X",
                                "owner_email": "owner@cafexyz.test",
                                "owner_password": "secret12",
                                "domain": "cafexyz.test"
                            })
    if err:
        log_test("10.5 - POST /platform/tenants creates tenant + pending domain", False, err)
    else:
        data = resp.json()
        tenant = data.get("tenant", {})
        domain = data.get("domain", {})
        new_tenant_id = tenant.get("id")
        new_domain_id = domain.get("id")
        if new_tenant_id and domain.get("domain") == "cafexyz.test" and domain.get("verified") == False:
            log_test("10.5 - POST /platform/tenants creates tenant + pending domain", True)
        else:
            log_test("10.5 - POST /platform/tenants", False, 
                    "Tenant or domain not created correctly")
else:
    log_test("10.5 - POST /platform/tenants", False, "Skipped - no platform cookies")

# Test 10.6: GET /api/tenant with Host cafexyz.test -> 404 (domain pending)
if new_domain_id:
    resp, err = make_request("GET", "/tenant", host="cafexyz.test", expect_status=404)
    if err:
        log_test("10.6 - GET /api/tenant with Host cafexyz.test -> 404 (domain pending)", False, err)
    else:
        log_test("10.6 - GET /api/tenant with Host cafexyz.test -> 404 (domain pending)", True)
else:
    log_test("10.6 - GET /api/tenant with Host cafexyz.test -> 404", False, 
            "Skipped - no new domain")

# Test 10.7: POST /platform/domains/:id/verify {force:true}
if platform_cookies and new_domain_id:
    resp, err = make_request("POST", f"/platform/domains/{new_domain_id}/verify", 
                            host="localhost", cookies=platform_cookies,
                            json_data={"force": True})
    if err:
        log_test("10.7 - POST /platform/domains/:id/verify {force:true}", False, err)
    else:
        data = resp.json()
        if data.get("verified") == True:
            log_test("10.7 - POST /platform/domains/:id/verify {force:true} -> verified", True)
        else:
            log_test("10.7 - POST /platform/domains/:id/verify", False, 
                    f"Expected verified=true, got {data.get('verified')}")
else:
    log_test("10.7 - POST /platform/domains/:id/verify", False, 
            "Skipped - no platform cookies or domain id")

# Test 10.8: GET /api/tenant with Host cafexyz.test -> Cafe XYZ
if new_domain_id:
    resp, err = make_request("GET", "/tenant", host="cafexyz.test")
    if err:
        log_test("10.8 - GET /api/tenant with Host cafexyz.test -> Cafe XYZ", False, err)
    else:
        data = resp.json()
        if data.get("tenant", {}).get("business_name") == "Cafe XYZ":
            log_test("10.8 - GET /api/tenant with Host cafexyz.test -> Cafe XYZ", True)
        else:
            log_test("10.8 - GET /api/tenant with Host cafexyz.test", False, 
                    f"Expected 'Cafe XYZ', got {data.get('tenant', {}).get('business_name')}")
else:
    log_test("10.8 - GET /api/tenant with Host cafexyz.test", False, 
            "Skipped - no new domain")

# Test 10.9: owner@cafexyz.test can login at /admin/auth/login with Host cafexyz.test
if new_tenant_id:
    resp, err = make_request("POST", "/admin/auth/login", host="cafexyz.test",
                            json_data={"email": "owner@cafexyz.test", "password": "secret12"})
    if err:
        log_test("10.9 - owner@cafexyz.test can login on Host cafexyz.test", False, err)
    else:
        data = resp.json()
        if data.get("user"):
            log_test("10.9 - owner@cafexyz.test can login on Host cafexyz.test", True)
        else:
            log_test("10.9 - owner@cafexyz.test can login", False, "No user in response")
else:
    log_test("10.9 - owner@cafexyz.test can login", False, "Skipped - no new tenant")

# Test 10.10: PATCH /platform/tenants/:id {status:'disabled'}
if platform_cookies and new_tenant_id:
    resp, err = make_request("PATCH", f"/platform/tenants/{new_tenant_id}", 
                            host="localhost", cookies=platform_cookies,
                            json_data={"status": "disabled"})
    if err:
        log_test("10.10 - PATCH /platform/tenants/:id {status:'disabled'}", False, err)
    else:
        # Now GET /api/tenant with Host cafexyz.test -> 404 TENANT_INACTIVE
        resp2, err2 = make_request("GET", "/tenant", host="cafexyz.test", expect_status=404)
        if err2:
            log_test("10.10 - PATCH tenant status=disabled -> GET /tenant -> 404 TENANT_INACTIVE", False, err2)
        else:
            data2 = resp2.json()
            if data2.get("code") == "TENANT_INACTIVE":
                log_test("10.10 - PATCH tenant status=disabled -> GET /tenant -> 404 TENANT_INACTIVE", True)
            else:
                log_test("10.10 - PATCH tenant status=disabled", False, 
                        f"Expected code TENANT_INACTIVE, got {data2.get('code')}")
else:
    log_test("10.10 - PATCH tenant status=disabled", False, 
            "Skipped - no platform cookies or tenant id")

# Test 10.11: Re-enable tenant
if platform_cookies and new_tenant_id:
    resp, err = make_request("PATCH", f"/platform/tenants/{new_tenant_id}", 
                            host="localhost", cookies=platform_cookies,
                            json_data={"status": "active"})
    if err:
        log_test("10.11 - PATCH /platform/tenants/:id {status:'active'} re-enable", False, err)
    else:
        log_test("10.11 - PATCH /platform/tenants/:id {status:'active'} re-enable", True)
else:
    log_test("10.11 - PATCH tenant status=active", False, 
            "Skipped - no platform cookies or tenant id")

# Test 10.12: POST /platform/domains with invalid domain -> 400
if platform_cookies:
    resp, err = make_request("POST", "/platform/domains", host="localhost",
                            cookies=platform_cookies,
                            json_data={"domain": "not a domain", "tenant_id": new_tenant_id},
                            expect_status=400)
    if err:
        log_test("10.12 - POST /platform/domains with invalid domain -> 400", False, err)
    else:
        log_test("10.12 - POST /platform/domains with invalid domain -> 400", True)
else:
    log_test("10.12 - POST /platform/domains invalid domain", False, "Skipped - no platform cookies")

# Test 10.13: POST /platform/domains with duplicate domain -> 400
if platform_cookies and new_tenant_id:
    resp, err = make_request("POST", "/platform/domains", host="localhost",
                            cookies=platform_cookies,
                            json_data={"domain": "thewhitemug.site", "tenant_id": new_tenant_id},
                            expect_status=400)
    if err:
        log_test("10.13 - POST /platform/domains duplicate domain -> 400", False, err)
    else:
        log_test("10.13 - POST /platform/domains duplicate domain -> 400", True)
else:
    log_test("10.13 - POST /platform/domains duplicate domain", False, 
            "Skipped - no platform cookies or tenant id")

# Test 10.14: Platform routes with Host thewhitemug.site -> 404
resp, err = make_request("GET", "/platform/tenants", host="thewhitemug.site", 
                        cookies=platform_cookies, expect_status=404)
if err:
    log_test("10.14 - Platform routes with Host thewhitemug.site -> 404", False, err)
else:
    log_test("10.14 - Platform routes with Host thewhitemug.site -> 404", True)

# Test 10.15: Unauthenticated GET /platform/tenants -> 401
resp, err = make_request("GET", "/platform/tenants", host="localhost", expect_status=401)
if err:
    log_test("10.15 - Unauthenticated GET /platform/tenants -> 401", False, err)
else:
    log_test("10.15 - Unauthenticated GET /platform/tenants -> 401", True)

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)
print(f"Total tests: {test_results['total']}")
print(f"Passed: {len(test_results['passed'])}")
print(f"Failed: {len(test_results['failed'])}")
print(f"Success rate: {len(test_results['passed']) / test_results['total'] * 100:.1f}%")

if test_results['failed']:
    print("\nFailed tests:")
    for test in test_results['failed']:
        print(f"  - {test}")

print("\n" + "=" * 80)
