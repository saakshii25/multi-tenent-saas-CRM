#!/usr/bin/env python3
"""
Focused regression test for QR settings persistence + kitchen hand-over rule
Multi-tenant ordering SaaS (Next.js + MongoDB)
"""

import requests
import json
import random
import string
from typing import Dict, Optional

# Base URL - using localhost:3000/api with explicit Host header
BASE_URL = "http://localhost:3000/api"
HOST = "thewhitemug.site"

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

def make_request(method: str, path: str, host: str = HOST, 
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
            raise ValueError(f"Unsupported method: {method}")
        
        success = resp.status_code == expect_status
        data = resp.json() if resp.headers.get('content-type', '').startswith('application/json') else {}
        return success, resp.status_code, data, resp.cookies
    except Exception as e:
        print(f"   Request error: {str(e)}")
        return False, 0, {}, {}

def random_string(length=8):
    """Generate random string"""
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

# ============================================================================
# TEST 1: QR SETTINGS PERSISTENCE
# ============================================================================

def test_qr_settings():
    """Test QR settings persistence with deduplication, trimming, partial updates, truncation"""
    print("\n" + "="*80)
    print("TEST 1: QR SETTINGS PERSISTENCE")
    print("="*80)
    
    # Login as owner
    print("\n[1.1] Login as owner...")
    success, status, data, cookies = make_request(
        "POST", "/admin/auth/login",
        json_data={"email": "owner@whitemug.demo", "password": "admin123"}
    )
    
    if not success or not data.get("user"):
        log_test("QR Settings - Owner login", False, f"Status: {status}, Data: {data}")
        return
    
    log_test("QR Settings - Owner login", True)
    owner_cookies = dict(cookies)
    
    # Test 1.2: PATCH with tables (including duplicates, whitespace, and normal values)
    print("\n[1.2] PATCH qr_settings with tables (duplicates, whitespace)...")
    success, status, data, _ = make_request(
        "PATCH", "/admin/settings",
        json_data={
            "qr_settings": {
                "tables": ["1", "2", "2", "  3 ", "Patio 1"],
                "rooms": ["101", "102"],
                "base_url": "https://thewhitemug.site"
            }
        },
        cookies=owner_cookies
    )
    
    if not success:
        log_test("QR Settings - PATCH with dedup/trim", False, f"Status: {status}, Data: {data}")
        return
    
    log_test("QR Settings - PATCH with dedup/trim", True)
    
    # Test 1.3: GET settings and verify deduplication and trimming
    print("\n[1.3] GET settings and verify tables deduped/trimmed...")
    success, status, data, _ = make_request(
        "GET", "/admin/settings",
        cookies=owner_cookies
    )
    
    if not success:
        log_test("QR Settings - GET after PATCH", False, f"Status: {status}")
        return
    
    settings = data.get("settings", {})
    qr_settings = settings.get("qr_settings", {})
    tables = qr_settings.get("tables", [])
    rooms = qr_settings.get("rooms", [])
    base_url = qr_settings.get("base_url", "")
    
    # Verify deduplication and trimming: ['1','2','2','  3 ','Patio 1'] -> ['1','2','3','Patio 1']
    expected_tables = ["1", "2", "3", "Patio 1"]
    expected_rooms = ["101", "102"]
    
    tables_match = tables == expected_tables
    rooms_match = rooms == expected_rooms
    base_url_match = base_url == "https://thewhitemug.site"
    
    if tables_match and rooms_match and base_url_match:
        log_test("QR Settings - Dedup/trim verification", True)
    else:
        log_test("QR Settings - Dedup/trim verification", False, 
                f"Expected tables: {expected_tables}, Got: {tables}; "
                f"Expected rooms: {expected_rooms}, Got: {rooms}; "
                f"Expected base_url: 'https://thewhitemug.site', Got: '{base_url}'")
        return
    
    # Test 1.4: Partial update - only update tables, rooms should be preserved
    print("\n[1.4] PATCH partial update (only tables)...")
    success, status, data, _ = make_request(
        "PATCH", "/admin/settings",
        json_data={
            "qr_settings": {
                "tables": ["5"]
            }
        },
        cookies=owner_cookies
    )
    
    if not success:
        log_test("QR Settings - Partial update PATCH", False, f"Status: {status}, Data: {data}")
        return
    
    log_test("QR Settings - Partial update PATCH", True)
    
    # Test 1.5: GET and verify rooms preserved
    print("\n[1.5] GET settings and verify rooms preserved...")
    success, status, data, _ = make_request(
        "GET", "/admin/settings",
        cookies=owner_cookies
    )
    
    if not success:
        log_test("QR Settings - GET after partial update", False, f"Status: {status}")
        return
    
    settings = data.get("settings", {})
    qr_settings = settings.get("qr_settings", {})
    tables = qr_settings.get("tables", [])
    rooms = qr_settings.get("rooms", [])
    
    tables_match = tables == ["5"]
    rooms_match = rooms == ["101", "102"]  # Should be preserved
    
    if tables_match and rooms_match:
        log_test("QR Settings - Partial update preserves other keys", True)
    else:
        log_test("QR Settings - Partial update preserves other keys", False,
                f"Expected tables: ['5'], Got: {tables}; "
                f"Expected rooms: ['101', '102'], Got: {rooms}")
        return
    
    # Test 1.6: Table label longer than 20 chars gets truncated
    print("\n[1.6] PATCH with table label > 20 chars...")
    long_label = "A" * 25  # 25 characters
    success, status, data, _ = make_request(
        "PATCH", "/admin/settings",
        json_data={
            "qr_settings": {
                "tables": [long_label]
            }
        },
        cookies=owner_cookies
    )
    
    if not success:
        log_test("QR Settings - PATCH with long label", False, f"Status: {status}, Data: {data}")
        return
    
    log_test("QR Settings - PATCH with long label", True)
    
    # Test 1.7: GET and verify truncation to 20 chars
    print("\n[1.7] GET settings and verify truncation to 20 chars...")
    success, status, data, _ = make_request(
        "GET", "/admin/settings",
        cookies=owner_cookies
    )
    
    if not success:
        log_test("QR Settings - GET after long label", False, f"Status: {status}")
        return
    
    settings = data.get("settings", {})
    qr_settings = settings.get("qr_settings", {})
    tables = qr_settings.get("tables", [])
    
    if len(tables) == 1 and len(tables[0]) == 20 and tables[0] == "A" * 20:
        log_test("QR Settings - Truncation to 20 chars", True)
    else:
        log_test("QR Settings - Truncation to 20 chars", False,
                f"Expected 1 table with 20 'A's, Got: {tables}")
        return
    
    # Test 1.8: GET /api/tenant must NOT contain qr_settings
    print("\n[1.8] GET /api/tenant (public) must NOT contain qr_settings...")
    success, status, data, _ = make_request(
        "GET", "/tenant"
    )
    
    if not success:
        log_test("QR Settings - GET /tenant", False, f"Status: {status}")
        return
    
    tenant = data.get("tenant", {})
    has_qr_settings = "qr_settings" in tenant
    
    if not has_qr_settings:
        log_test("QR Settings - Not exposed in public /tenant", True)
    else:
        log_test("QR Settings - Not exposed in public /tenant", False,
                f"qr_settings found in public tenant endpoint: {tenant.get('qr_settings')}")
        return
    
    # Test 1.9: Restore to empty state
    print("\n[1.9] Restore qr_settings to empty state...")
    success, status, data, _ = make_request(
        "PATCH", "/admin/settings",
        json_data={
            "qr_settings": {
                "tables": [],
                "rooms": [],
                "base_url": ""
            }
        },
        cookies=owner_cookies
    )
    
    if success:
        log_test("QR Settings - Restore to empty", True)
    else:
        log_test("QR Settings - Restore to empty", False, f"Status: {status}, Data: {data}")

# ============================================================================
# TEST 2: KITCHEN HAND-OVER RULE
# ============================================================================

def test_kitchen_handover():
    """Test kitchen can hand over non-delivery orders but not delivery orders"""
    print("\n" + "="*80)
    print("TEST 2: KITCHEN HAND-OVER RULE")
    print("="*80)
    
    # Login as customer
    print("\n[2.1] Customer OTP login...")
    phone = f"9{random.randint(100000000, 999999999)}"
    
    success, status, data, _ = make_request(
        "POST", "/auth/otp/request",
        json_data={"phone": phone}
    )
    
    if not success or "dev_otp" not in data:
        log_test("Kitchen Handover - Customer OTP request", False, f"Status: {status}, Data: {data}")
        return
    
    otp = data["dev_otp"]
    log_test("Kitchen Handover - Customer OTP request", True)
    
    success, status, data, cookies = make_request(
        "POST", "/auth/otp/verify",
        json_data={"phone": phone, "code": otp, "name": "KDS Test Customer"}
    )
    
    if not success or not data.get("customer"):
        log_test("Kitchen Handover - Customer OTP verify", False, f"Status: {status}, Data: {data}")
        return
    
    log_test("Kitchen Handover - Customer OTP verify", True)
    customer_cookies = dict(cookies)
    
    # Get menu to find a product without variants
    print("\n[2.2] Get menu to find product...")
    success, status, data, _ = make_request("GET", "/menu")
    
    if not success:
        log_test("Kitchen Handover - Get menu", False, f"Status: {status}")
        return
    
    log_test("Kitchen Handover - Get menu", True)
    
    # Find 'Pour Over (Single Origin)' or any available product without variants
    products = data.get("products", [])
    
    product = None
    for p in products:
        # Skip unavailable products
        if not p.get("is_available", False):
            continue
        if "Pour Over" in p.get("name", "") or len(p.get("variants", [])) == 0:
            product = p
            break
    
    if not product:
        # Just use the first available product
        for p in products:
            if p.get("is_available", False):
                product = p
                break
    
    if not product:
        log_test("Kitchen Handover - Find product", False, "No available products found in menu")
        return
    
    log_test("Kitchen Handover - Find product", True, f"Using product: {product.get('name')}")
    
    # Place PICKUP order
    print("\n[2.3] Place PICKUP order...")
    idempotency_key = f"kds-test-{random_string()}"
    
    order_data = {
        "items": [{"product_id": product["id"], "qty": 1}],
        "mode": "PICKUP",
        "idempotency_key": idempotency_key,
        "payment_method": "COD",
        "contact": {
            "name": "KDS Test",
            "phone": phone
        }
    }
    
    # Add variant_id if product has variants
    if product.get("variants") and len(product["variants"]) > 0:
        order_data["items"][0]["variant_id"] = product["variants"][0]["id"]
    
    success, status, data, _ = make_request(
        "POST", "/checkout/place",
        json_data=order_data,
        cookies=customer_cookies
    )
    
    if not success or not data.get("order"):
        log_test("Kitchen Handover - Place PICKUP order", False, f"Status: {status}, Data: {data}")
        return
    
    log_test("Kitchen Handover - Place PICKUP order", True)
    pickup_order_id = data["order"]["id"]
    
    # Login as kitchen
    print("\n[2.4] Login as kitchen...")
    success, status, data, cookies = make_request(
        "POST", "/admin/auth/login",
        json_data={"email": "kitchen@whitemug.demo", "password": "kitchen123"}
    )
    
    if not success or not data.get("user"):
        log_test("Kitchen Handover - Kitchen login", False, f"Status: {status}, Data: {data}")
        return
    
    log_test("Kitchen Handover - Kitchen login", True)
    kitchen_cookies = dict(cookies)
    
    # Move PICKUP order through states: ACCEPTED -> PREPARING -> READY -> DELIVERED
    print("\n[2.5] Kitchen: PICKUP order ACCEPTED...")
    success, status, data, _ = make_request(
        "PATCH", f"/admin/orders/{pickup_order_id}/status",
        json_data={"status": "ACCEPTED"},
        cookies=kitchen_cookies
    )
    
    if success:
        log_test("Kitchen Handover - PICKUP ACCEPTED", True)
    else:
        log_test("Kitchen Handover - PICKUP ACCEPTED", False, f"Status: {status}, Data: {data}")
        return
    
    print("\n[2.6] Kitchen: PICKUP order PREPARING...")
    success, status, data, _ = make_request(
        "PATCH", f"/admin/orders/{pickup_order_id}/status",
        json_data={"status": "PREPARING"},
        cookies=kitchen_cookies
    )
    
    if success:
        log_test("Kitchen Handover - PICKUP PREPARING", True)
    else:
        log_test("Kitchen Handover - PICKUP PREPARING", False, f"Status: {status}, Data: {data}")
        return
    
    print("\n[2.7] Kitchen: PICKUP order READY...")
    success, status, data, _ = make_request(
        "PATCH", f"/admin/orders/{pickup_order_id}/status",
        json_data={"status": "READY"},
        cookies=kitchen_cookies
    )
    
    if success:
        log_test("Kitchen Handover - PICKUP READY", True)
    else:
        log_test("Kitchen Handover - PICKUP READY", False, f"Status: {status}, Data: {data}")
        return
    
    print("\n[2.8] Kitchen: PICKUP order DELIVERED (should succeed)...")
    success, status, data, _ = make_request(
        "PATCH", f"/admin/orders/{pickup_order_id}/status",
        json_data={"status": "DELIVERED"},
        cookies=kitchen_cookies
    )
    
    if success:
        # Verify payment_status is PAID
        order = data.get("order", {})
        payment_status = order.get("payment_status")
        if payment_status == "PAID":
            log_test("Kitchen Handover - PICKUP DELIVERED with PAID status", True)
        else:
            log_test("Kitchen Handover - PICKUP DELIVERED with PAID status", False,
                    f"Expected payment_status=PAID, Got: {payment_status}")
    else:
        log_test("Kitchen Handover - PICKUP DELIVERED", False, f"Status: {status}, Data: {data}")
        return
    
    # Now test DELIVERY order
    print("\n[2.9] Place DELIVERY order...")
    idempotency_key = f"kds-test-delivery-{random_string()}"
    
    order_data = {
        "items": [{"product_id": product["id"], "qty": 1}],
        "mode": "DELIVERY",
        "idempotency_key": idempotency_key,
        "payment_method": "COD",
        "contact": {
            "name": "KDS Test",
            "phone": phone
        },
        "address": {
            "line1": "12 Test St",
            "city": "Pune",
            "pincode": "411001"
        }
    }
    
    # Add variant_id if product has variants
    if product.get("variants") and len(product["variants"]) > 0:
        order_data["items"][0]["variant_id"] = product["variants"][0]["id"]
    
    success, status, data, _ = make_request(
        "POST", "/checkout/place",
        json_data=order_data,
        cookies=customer_cookies
    )
    
    if not success or not data.get("order"):
        log_test("Kitchen Handover - Place DELIVERY order", False, f"Status: {status}, Data: {data}")
        return
    
    log_test("Kitchen Handover - Place DELIVERY order", True)
    delivery_order_id = data["order"]["id"]
    
    # Move DELIVERY order to READY
    print("\n[2.10] Kitchen: DELIVERY order ACCEPTED...")
    success, status, data, _ = make_request(
        "PATCH", f"/admin/orders/{delivery_order_id}/status",
        json_data={"status": "ACCEPTED"},
        cookies=kitchen_cookies
    )
    
    if success:
        log_test("Kitchen Handover - DELIVERY ACCEPTED", True)
    else:
        log_test("Kitchen Handover - DELIVERY ACCEPTED", False, f"Status: {status}, Data: {data}")
        return
    
    print("\n[2.11] Kitchen: DELIVERY order PREPARING...")
    success, status, data, _ = make_request(
        "PATCH", f"/admin/orders/{delivery_order_id}/status",
        json_data={"status": "PREPARING"},
        cookies=kitchen_cookies
    )
    
    if success:
        log_test("Kitchen Handover - DELIVERY PREPARING", True)
    else:
        log_test("Kitchen Handover - DELIVERY PREPARING", False, f"Status: {status}, Data: {data}")
        return
    
    print("\n[2.12] Kitchen: DELIVERY order READY...")
    success, status, data, _ = make_request(
        "PATCH", f"/admin/orders/{delivery_order_id}/status",
        json_data={"status": "READY"},
        cookies=kitchen_cookies
    )
    
    if success:
        log_test("Kitchen Handover - DELIVERY READY", True)
    else:
        log_test("Kitchen Handover - DELIVERY READY", False, f"Status: {status}, Data: {data}")
        return
    
    # Kitchen tries to set DELIVERED on DELIVERY order (should fail with 400)
    print("\n[2.13] Kitchen: DELIVERY order DELIVERED (should fail with 400)...")
    success, status, data, _ = make_request(
        "PATCH", f"/admin/orders/{delivery_order_id}/status",
        json_data={"status": "DELIVERED"},
        cookies=kitchen_cookies,
        expect_status=400
    )
    
    if success and status == 400:
        log_test("Kitchen Handover - DELIVERY DELIVERED blocked (400)", True)
    else:
        log_test("Kitchen Handover - DELIVERY DELIVERED blocked (400)", False,
                f"Expected 400, Got: {status}, Data: {data}")
        return
    
    # Kitchen tries to set OUT_FOR_DELIVERY on DELIVERY order (should fail with 400)
    print("\n[2.14] Kitchen: DELIVERY order OUT_FOR_DELIVERY (should fail with 400)...")
    success, status, data, _ = make_request(
        "PATCH", f"/admin/orders/{delivery_order_id}/status",
        json_data={"status": "OUT_FOR_DELIVERY"},
        cookies=kitchen_cookies,
        expect_status=400
    )
    
    if success and status == 400:
        log_test("Kitchen Handover - DELIVERY OUT_FOR_DELIVERY blocked (400)", True)
    else:
        log_test("Kitchen Handover - DELIVERY OUT_FOR_DELIVERY blocked (400)", False,
                f"Expected 400, Got: {status}, Data: {data}")
        return
    
    # Login as owner and complete the DELIVERY order
    print("\n[2.15] Login as owner...")
    success, status, data, cookies = make_request(
        "POST", "/admin/auth/login",
        json_data={"email": "owner@whitemug.demo", "password": "admin123"}
    )
    
    if not success or not data.get("user"):
        log_test("Kitchen Handover - Owner login", False, f"Status: {status}, Data: {data}")
        return
    
    log_test("Kitchen Handover - Owner login", True)
    owner_cookies = dict(cookies)
    
    print("\n[2.16] Owner: DELIVERY order OUT_FOR_DELIVERY...")
    success, status, data, _ = make_request(
        "PATCH", f"/admin/orders/{delivery_order_id}/status",
        json_data={"status": "OUT_FOR_DELIVERY"},
        cookies=owner_cookies
    )
    
    if success:
        log_test("Kitchen Handover - Owner OUT_FOR_DELIVERY", True)
    else:
        log_test("Kitchen Handover - Owner OUT_FOR_DELIVERY", False, f"Status: {status}, Data: {data}")
        return
    
    print("\n[2.17] Owner: DELIVERY order DELIVERED...")
    success, status, data, _ = make_request(
        "PATCH", f"/admin/orders/{delivery_order_id}/status",
        json_data={"status": "DELIVERED"},
        cookies=owner_cookies
    )
    
    if success:
        log_test("Kitchen Handover - Owner DELIVERED", True)
    else:
        log_test("Kitchen Handover - Owner DELIVERED", False, f"Status: {status}, Data: {data}")

# ============================================================================
# TEST 3: SMOKE TEST
# ============================================================================

def test_smoke():
    """Quick smoke test to ensure nothing else broke"""
    print("\n" + "="*80)
    print("TEST 3: SMOKE TEST")
    print("="*80)
    
    # Test 3.1: GET /api/tenant for thewhitemug.site
    print("\n[3.1] GET /api/tenant (Host: thewhitemug.site)...")
    success, status, data, _ = make_request("GET", "/tenant", host="thewhitemug.site")
    
    if success and data.get("tenant", {}).get("business_name"):
        log_test("Smoke - GET /tenant (thewhitemug.site)", True)
        whitemug_name = data["tenant"]["business_name"]
    else:
        log_test("Smoke - GET /tenant (thewhitemug.site)", False, f"Status: {status}, Data: {data}")
        return
    
    # Test 3.2: GET /api/tenant for abchotel.com
    print("\n[3.2] GET /api/tenant (Host: abchotel.com)...")
    success, status, data, _ = make_request("GET", "/tenant", host="abchotel.com")
    
    if success and data.get("tenant", {}).get("business_name"):
        log_test("Smoke - GET /tenant (abchotel.com)", True)
        abc_name = data["tenant"]["business_name"]
        
        # Verify they are different tenants
        if whitemug_name != abc_name:
            log_test("Smoke - Different tenants verified", True)
        else:
            log_test("Smoke - Different tenants verified", False,
                    f"Both tenants have same name: {whitemug_name}")
    else:
        log_test("Smoke - GET /tenant (abchotel.com)", False, f"Status: {status}, Data: {data}")
        return
    
    # Test 3.3: GET /api/menu
    print("\n[3.3] GET /api/menu...")
    success, status, data, _ = make_request("GET", "/menu")
    
    if success and "categories" in data:
        log_test("Smoke - GET /menu", True)
    else:
        log_test("Smoke - GET /menu", False, f"Status: {status}, Data: {data}")
        return
    
    # Test 3.4: GET /api/admin/orders?scope=board (requires owner login)
    print("\n[3.4] Login as owner for admin tests...")
    success, status, data, cookies = make_request(
        "POST", "/admin/auth/login",
        json_data={"email": "owner@whitemug.demo", "password": "admin123"}
    )
    
    if not success:
        log_test("Smoke - Owner login", False, f"Status: {status}, Data: {data}")
        return
    
    log_test("Smoke - Owner login", True)
    owner_cookies = dict(cookies)
    
    print("\n[3.5] GET /api/admin/orders?scope=board...")
    success, status, data, _ = make_request(
        "GET", "/admin/orders?scope=board",
        cookies=owner_cookies
    )
    
    if success and "orders" in data:
        log_test("Smoke - GET /admin/orders?scope=board", True)
    else:
        log_test("Smoke - GET /admin/orders?scope=board", False, f"Status: {status}, Data: {data}")
        return
    
    # Test 3.6: GET /api/admin/dashboard
    print("\n[3.6] GET /api/admin/dashboard...")
    success, status, data, _ = make_request(
        "GET", "/admin/dashboard",
        cookies=owner_cookies
    )
    
    if success and "today" in data and "live" in data:
        log_test("Smoke - GET /admin/dashboard", True)
    else:
        log_test("Smoke - GET /admin/dashboard", False, f"Status: {status}, Data: {data}")

# ============================================================================
# MAIN
# ============================================================================

def main():
    print("\n" + "="*80)
    print("REGRESSION TEST: QR Settings + Kitchen Hand-over Rule")
    print("Multi-tenant Ordering SaaS (Next.js + MongoDB)")
    print("="*80)
    
    try:
        # Run all tests
        test_qr_settings()
        test_kitchen_handover()
        test_smoke()
        
        # Print summary
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        print(f"Total tests: {test_results['total']}")
        print(f"Passed: {len(test_results['passed'])}")
        print(f"Failed: {len(test_results['failed'])}")
        
        if test_results['failed']:
            print("\nFailed tests:")
            for test in test_results['failed']:
                print(f"  ❌ {test}")
        
        print("\n" + "="*80)
        
        if test_results['failed']:
            exit(1)
        else:
            print("✅ ALL TESTS PASSED")
            exit(0)
            
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        exit(1)

if __name__ == "__main__":
    main()
