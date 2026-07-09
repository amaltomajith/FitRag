import os
import json
import logging
import urllib.request
import urllib.parse
from typing import Optional

logger = logging.getLogger("fitrag.media")

def search_youtube(query: str) -> Optional[dict]:
    """
    Search YouTube Data API v3 for the given query.
    Returns:
        dict: {
            "video_id": str,
            "title": str,
            "thumbnail_url": str,
            "video_url": str
        } or None if not found/error.
    """
    api_key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not api_key:
        logger.warning("[media] YOUTUBE_API_KEY is not set or empty. Skipping search.")
        return None

    try:
        encoded_query = urllib.parse.quote(query)
        url = (
            f"https://www.googleapis.com/youtube/v3/search"
            f"?part=snippet&type=video&maxResults=1&q={encoded_query}&key={api_key}"
        )
        
        req = urllib.request.Request(
            url, 
            headers={"User-Agent": "FitRAG-App/1.0"}
        )
        
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status != 200:
                logger.error(f"[media] YouTube API returned status {response.status}")
                return None
            
            data = json.loads(response.read().decode("utf-8"))
            items = data.get("items", [])
            if not items:
                logger.info(f"[media] No results returned for query: {query}")
                return None
            
            first_item = items[0]
            video_id = first_item.get("id", {}).get("videoId")
            if not video_id:
                logger.warning("[media] First search item did not contain videoId.")
                return None
            
            snippet = first_item.get("snippet", {})
            title = snippet.get("title", "YouTube Video")
            
            # Extract medium thumbnail, fallback to default or high
            thumbnails = snippet.get("thumbnails", {})
            thumb_obj = thumbnails.get("medium") or thumbnails.get("default") or thumbnails.get("high") or {}
            thumbnail_url = thumb_obj.get("url", "")
            
            video_url = f"https://www.youtube.com/watch?v={video_id}"
            
            logger.info(f"[media] Successfully found video: {title} ({video_id})")
            return {
                "video_id": video_id,
                "title": title,
                "thumbnail_url": thumbnail_url,
                "video_url": video_url
            }
            
    except Exception as e:
        logger.exception(f"[media] Error occurred while searching YouTube for query '{query}': {e}")
        return None
