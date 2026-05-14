"""
Backend API Tests for GutenLib
Tests Arabic books API (ABL gRPC) and English books API (Gutendex)
"""
import pytest
import requests
import os

# Use external URL for testing
BASE_URL = "https://1722e51b-d601-4646-bd4e-ff44f45f6aa3.preview.emergentagent.com"


class TestArabicBooksAPI:
    """Tests for Arabic books API (ABL gRPC integration)"""
    
    def test_arabic_books_list_returns_data(self):
        """Test that Arabic books API returns books with pagination"""
        response = requests.get(f"{BASE_URL}/api/abl/books?page=1&perPage=10&lang=ar", timeout=30)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "books" in data, "Response should contain 'books' key"
        assert "pagination" in data, "Response should contain 'pagination' key"
        
        # Verify books array has data
        books = data["books"]
        assert len(books) > 0, "Books array should not be empty"
        
        # Verify pagination
        pagination = data["pagination"]
        assert pagination.get("totalItems", 0) > 0, "Total items should be greater than 0"
        assert pagination.get("currentPage") == 1, "Current page should be 1"
        
        print(f"✓ Arabic books API returned {len(books)} books, total: {pagination.get('totalItems')}")
    
    def test_arabic_books_have_required_fields(self):
        """Test that Arabic books have required fields"""
        response = requests.get(f"{BASE_URL}/api/abl/books?page=1&perPage=5&lang=ar", timeout=30)
        
        assert response.status_code == 200
        data = response.json()
        books = data.get("books", [])
        
        assert len(books) > 0, "Should have at least one book"
        
        # Check first book has required fields
        book = books[0]
        assert "id" in book, "Book should have 'id'"
        assert "title" in book, "Book should have 'title'"
        
        print(f"✓ First book: ID={book['id']}, Title={book['title'][:50]}...")
    
    def test_arabic_book_detail(self):
        """Test Arabic book detail API"""
        response = requests.get(f"{BASE_URL}/api/abl/book/1?lang=ar", timeout=30)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "book" in data, "Response should contain 'book' key"
        
        book = data["book"]
        assert book.get("id") == "1", "Book ID should be '1'"
        assert "title" in book, "Book should have title"
        assert len(book.get("title", "")) > 0, "Title should not be empty"
        
        print(f"✓ Arabic book detail: {book['title']}")
    
    def test_arabic_books_pagination(self):
        """Test Arabic books pagination works"""
        # Get page 1
        response1 = requests.get(f"{BASE_URL}/api/abl/books?page=1&perPage=5&lang=ar", timeout=30)
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Get page 2
        response2 = requests.get(f"{BASE_URL}/api/abl/books?page=2&perPage=5&lang=ar", timeout=30)
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Verify different books on different pages
        books1_ids = [b["id"] for b in data1.get("books", [])]
        books2_ids = [b["id"] for b in data2.get("books", [])]
        
        # At least some books should be different
        assert books1_ids != books2_ids, "Page 1 and Page 2 should have different books"
        
        print(f"✓ Pagination works: Page 1 IDs={books1_ids[:3]}, Page 2 IDs={books2_ids[:3]}")


class TestEnglishBooksAPI:
    """Tests for English books API (Gutendex integration)"""
    
    def test_english_books_list(self):
        """Test English books API returns data"""
        response = requests.get(f"{BASE_URL}/api/books?page=1", timeout=30)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "results" in data, "Response should contain 'results' key"
        
        results = data["results"]
        assert len(results) > 0, "Results should not be empty"
        
        print(f"✓ English books API returned {len(results)} books")
    
    def test_english_book_detail(self):
        """Test English book detail API"""
        response = requests.get(f"{BASE_URL}/api/book/84", timeout=30)  # Frankenstein
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "id" in data, "Response should contain 'id'"
        assert data["id"] == 84, "Book ID should be 84"
        assert "title" in data, "Response should contain 'title'"
        
        print(f"✓ English book detail: {data['title']}")
    
    def test_english_books_search(self):
        """Test English books search functionality"""
        response = requests.get(f"{BASE_URL}/api/books?search=shakespeare", timeout=30)
        
        assert response.status_code == 200
        data = response.json()
        
        results = data.get("results", [])
        assert len(results) > 0, "Search should return results"
        
        # Verify search relevance
        titles = [r.get("title", "").lower() for r in results]
        authors = [str(r.get("authors", [])).lower() for r in results]
        
        has_shakespeare = any("shakespeare" in t or "shakespeare" in a for t, a in zip(titles, authors))
        assert has_shakespeare, "Search results should include Shakespeare"
        
        print(f"✓ Search returned {len(results)} results for 'shakespeare'")


class TestSearchAPI:
    """Tests for search API"""
    
    def test_search_suggest_endpoint(self):
        """Test search suggest API endpoint"""
        response = requests.get(f"{BASE_URL}/api/search/suggest?q=pride", timeout=30)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Search should return some results
        assert isinstance(data, (list, dict)), "Response should be list or dict"
        
        print(f"✓ Search suggest API works")


class TestHealthAPI:
    """Tests for health check API"""
    
    def test_health_endpoint(self):
        """Test health check endpoint"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        print("✓ Health check passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
