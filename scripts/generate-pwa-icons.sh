#!/bin/bash

# Script to generate PWA icons from a source image
# Usage: ./scripts/generate-pwa-icons.sh [source-image] [output-dir]
# Example: ./scripts/generate-pwa-icons.sh public/placeholder.svg public

SOURCE_IMAGE="${1:-public/favicon.ico}"
OUTPUT_DIR="${2:-public}"

# Icon sizes for PWA
SIZES=(72 96 128 144 152 192 384 512)

echo "Generating PWA icons from $SOURCE_IMAGE..."

# Check if source image exists
if [ ! -f "$SOURCE_IMAGE" ]; then
    echo "Error: Source image not found: $SOURCE_IMAGE"
    echo "Please provide a valid image file (PNG, SVG, or JPG)"
    exit 1
fi

# Check if sips is available (macOS)
if command -v sips &> /dev/null; then
    echo "Using sips (macOS) to generate icons..."
    
    for size in "${SIZES[@]}"; do
        OUTPUT_FILE="$OUTPUT_DIR/icon-${size}x${size}.png"
        sips -z $size $size "$SOURCE_IMAGE" --out "$OUTPUT_FILE" > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            echo "✓ Generated $OUTPUT_FILE"
        else
            echo "✗ Failed to generate $OUTPUT_FILE"
        fi
    done
elif command -v convert &> /dev/null; then
    echo "Using ImageMagick to generate icons..."
    
    for size in "${SIZES[@]}"; do
        OUTPUT_FILE="$OUTPUT_DIR/icon-${size}x${size}.png"
        convert "$SOURCE_IMAGE" -resize "${size}x${size}" "$OUTPUT_FILE"
        
        if [ $? -eq 0 ]; then
            echo "✓ Generated $OUTPUT_FILE"
        else
            echo "✗ Failed to generate $OUTPUT_FILE"
        fi
    done
else
    echo "Error: No image conversion tool found."
    echo "Please install ImageMagick (convert) or use macOS (sips)"
    echo ""
    echo "For macOS: sips is already available"
    echo "For Linux: sudo apt-get install imagemagick"
    echo "For Windows: Install ImageMagick from https://imagemagick.org/"
    exit 1
fi

echo ""
echo "✓ All icons generated successfully!"
echo "Icons are saved in: $OUTPUT_DIR"
echo ""
echo "Note: Make sure to replace placeholder.svg with your actual app icon/logo"

