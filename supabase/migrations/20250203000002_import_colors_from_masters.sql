-- Migration: Import Colors from Masters
-- This function extracts unique colors from fabric_master, item_master, and product_master
-- and imports them into the colors table

-- Create function to get hex code from color name
CREATE OR REPLACE FUNCTION get_hex_from_color_name(color_name TEXT)
RETURNS TEXT AS $$
DECLARE
    normalized_color TEXT;
BEGIN
    -- Normalize color name (trim, lowercase)
    normalized_color := LOWER(TRIM(color_name));
    
    -- Color name to hex code mapping (case-insensitive)
    CASE normalized_color
        WHEN 'red' THEN RETURN '#FF0000';
        WHEN 'blue' THEN RETURN '#0000FF';
        WHEN 'green' THEN RETURN '#008000';
        WHEN 'yellow' THEN RETURN '#FFFF00';
        WHEN 'black' THEN RETURN '#000000';
        WHEN 'white' THEN RETURN '#FFFFFF';
        WHEN 'gray', 'grey' THEN RETURN '#808080';
        WHEN 'brown' THEN RETURN '#A52A2A';
        WHEN 'orange' THEN RETURN '#FFA500';
        WHEN 'pink' THEN RETURN '#FFC0CB';
        WHEN 'purple' THEN RETURN '#800080';
        WHEN 'cyan' THEN RETURN '#00FFFF';
        WHEN 'magenta' THEN RETURN '#FF00FF';
        WHEN 'lime' THEN RETURN '#00FF00';
        WHEN 'navy' THEN RETURN '#000080';
        WHEN 'maroon' THEN RETURN '#800000';
        WHEN 'olive' THEN RETURN '#808000';
        WHEN 'teal' THEN RETURN '#008080';
        WHEN 'silver' THEN RETURN '#C0C0C0';
        WHEN 'gold' THEN RETURN '#FFD700';
        WHEN 'beige' THEN RETURN '#F5F5DC';
        WHEN 'coral' THEN RETURN '#FF7F50';
        WHEN 'crimson' THEN RETURN '#DC143C';
        WHEN 'lavender' THEN RETURN '#E6E6FA';
        WHEN 'salmon' THEN RETURN '#FA8072';
        WHEN 'indigo' THEN RETURN '#4B0082';
        WHEN 'slate blue' THEN RETURN '#6A5ACD';
        WHEN 'chocolate' THEN RETURN '#D2691E';
        ELSE RETURN '#CCCCCC'; -- Default gray for unknown colors
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Main function to import colors from masters
CREATE OR REPLACE FUNCTION import_colors_from_masters()
RETURNS JSON AS $$
DECLARE
    fabric_color RECORD;
    item_color RECORD;
    product_color RECORD;
    color_record RECORD;
    color_name TEXT;
    color_hex TEXT;
    existing_color_count INTEGER;
    inserted_count INTEGER := 0;
    skipped_count INTEGER := 0;
    total_found_count INTEGER := 0;
    color_map JSONB := '{}'::JSONB;
BEGIN
    -- Step 1: Collect all unique colors from fabric_master (with hex codes)
    FOR fabric_color IN
        SELECT DISTINCT 
            TRIM(color) as color_name,
            TRIM(hex) as hex_code
        FROM fabric_master
        WHERE color IS NOT NULL 
        AND TRIM(color) != ''
        AND hex IS NOT NULL
        AND TRIM(hex) != ''
    LOOP
        -- Normalize color name (case-insensitive key)
        color_name := LOWER(fabric_color.color_name);
        
        -- Store in map, prioritizing existing hex if already present
        IF NOT (color_map ? color_name) THEN
            color_map := color_map || jsonb_build_object(
                color_name,
                jsonb_build_object(
                    'name', fabric_color.color_name,
                    'hex', CASE 
                        WHEN fabric_color.hex_code ~ '^#?[0-9A-Fa-f]{3,6}$' 
                        THEN CASE 
                            WHEN fabric_color.hex_code LIKE '#%' 
                            THEN UPPER(fabric_color.hex_code)
                            ELSE UPPER('#' || fabric_color.hex_code)
                        END
                        ELSE get_hex_from_color_name(fabric_color.color_name)
                    END,
                    'source', 'fabric_master'
                )
            );
            total_found_count := total_found_count + 1;
        END IF;
    END LOOP;
    
    -- Step 2: Collect all unique colors from item_master (without hex codes)
    FOR item_color IN
        SELECT DISTINCT TRIM(color) as color_name
        FROM item_master
        WHERE color IS NOT NULL 
        AND TRIM(color) != ''
    LOOP
        color_name := LOWER(item_color.color_name);
        
        -- Only add if not already in map (fabric_master takes priority)
        IF NOT (color_map ? color_name) THEN
            color_map := color_map || jsonb_build_object(
                color_name,
                jsonb_build_object(
                    'name', item_color.color_name,
                    'hex', get_hex_from_color_name(item_color.color_name),
                    'source', 'item_master'
                )
            );
            total_found_count := total_found_count + 1;
        END IF;
    END LOOP;
    
    -- Step 3: Collect all unique colors from product_master (without hex codes)
    FOR product_color IN
        SELECT DISTINCT TRIM(color) as color_name
        FROM product_master
        WHERE color IS NOT NULL 
        AND TRIM(color) != ''
    LOOP
        color_name := LOWER(product_color.color_name);
        
        -- Only add if not already in map (fabric_master takes priority)
        IF NOT (color_map ? color_name) THEN
            color_map := color_map || jsonb_build_object(
                color_name,
                jsonb_build_object(
                    'name', product_color.color_name,
                    'hex', get_hex_from_color_name(product_color.color_name),
                    'source', 'product_master'
                )
            );
            total_found_count := total_found_count + 1;
        END IF;
    END LOOP;
    
    -- Step 4: Insert colors that don't already exist in colors table
    FOR color_record IN
        SELECT 
            (value->>'name')::TEXT as name,
            (value->>'hex')::TEXT as hex,
            (value->>'source')::TEXT as source
        FROM jsonb_each(color_map)
    LOOP
        -- Check if color already exists (case-insensitive)
        SELECT COUNT(*) INTO existing_color_count
        FROM colors
        WHERE LOWER(TRIM(color)) = LOWER(TRIM(color_record.name));
        
        IF existing_color_count = 0 THEN
            -- Insert new color
            BEGIN
                INSERT INTO colors (color, hex, imported_from)
                VALUES (color_record.name, color_record.hex, color_record.source);
                inserted_count := inserted_count + 1;
            EXCEPTION
                WHEN unique_violation THEN
                    skipped_count := skipped_count + 1;
                WHEN OTHERS THEN
                    skipped_count := skipped_count + 1;
            END;
        ELSE
            skipped_count := skipped_count + 1;
        END IF;
    END LOOP;
    
    -- Return summary
    RETURN json_build_object(
        'success', true,
        'inserted', inserted_count,
        'skipped', skipped_count,
        'total_found', total_found_count
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM,
            'inserted', inserted_count,
            'skipped', skipped_count
        );
END;
$$ LANGUAGE plpgsql;

-- Add comment to function
COMMENT ON FUNCTION import_colors_from_masters() IS 'Imports unique colors from fabric_master, item_master, and product_master tables into the colors table. Returns a JSON summary of the import operation.';

