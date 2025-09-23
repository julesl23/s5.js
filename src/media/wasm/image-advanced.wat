;; Advanced WebAssembly module for image metadata extraction
;; Includes color space detection, bit depth analysis, EXIF parsing, and histogram generation

(module
  ;; Memory: 1 page (64KB) initially, max 256 pages (16MB)
  (memory (export "memory") 1 256)

  ;; Global variables
  (global $heap_ptr (mut i32) (i32.const 1024))  ;; Start heap at 1KB

  ;; Function to allocate memory
  (func $malloc (export "malloc") (param $size i32) (result i32)
    (local $ptr i32)
    global.get $heap_ptr
    local.set $ptr
    global.get $heap_ptr
    local.get $size
    i32.add
    global.set $heap_ptr
    local.get $ptr
  )

  ;; Function to free memory (simplified)
  (func $free (export "free") (param $ptr i32)
    nop
  )

  ;; Detect bit depth from PNG IHDR chunk
  (func $detect_png_bit_depth (export "detect_png_bit_depth")
        (param $data_ptr i32) (param $data_len i32) (result i32)
    ;; Check PNG signature first
    local.get $data_len
    i32.const 25
    i32.lt_u
    if
      i32.const 0  ;; Not enough data
      return
    end

    ;; Check PNG signature (0x89 0x50 0x4E 0x47)
    local.get $data_ptr
    i32.load8_u
    i32.const 0x89
    i32.ne
    if
      i32.const 0  ;; Not PNG
      return
    end

    local.get $data_ptr
    i32.const 1
    i32.add
    i32.load8_u
    i32.const 0x50
    i32.ne
    if
      i32.const 0  ;; Not PNG
      return
    end

    ;; Return bit depth value at byte 24
    local.get $data_ptr
    i32.const 24
    i32.add
    i32.load8_u
  )

  ;; Detect color type from PNG IHDR chunk
  (func $detect_png_color_type (export "detect_png_color_type")
        (param $data_ptr i32) (param $data_len i32) (result i32)
    ;; PNG color type is at byte 25 in IHDR chunk
    ;; 0 = Grayscale, 2 = Truecolor, 3 = Indexed, 4 = Grayscale+Alpha, 6 = Truecolor+Alpha
    local.get $data_len
    i32.const 26
    i32.lt_u
    if
      i32.const 2  ;; Default to truecolor
      return
    end

    local.get $data_ptr
    i32.const 25
    i32.add
    i32.load8_u
  )

  ;; Check if image has alpha channel
  (func $has_alpha_channel (export "has_alpha_channel")
        (param $data_ptr i32) (param $data_len i32) (result i32)
    (local $format i32)
    (local $color_type i32)

    ;; First detect the format
    local.get $data_ptr
    local.get $data_len
    call $detect_format
    local.set $format

    ;; Format: 1=JPEG, 2=PNG, 3=GIF, 4=BMP, 5=WEBP

    ;; JPEG never has alpha
    local.get $format
    i32.const 1
    i32.eq
    if
      i32.const 0
      return
    end

    ;; For PNG, check color type
    local.get $format
    i32.const 2
    i32.eq
    if
      local.get $data_ptr
      local.get $data_len
      call $detect_png_color_type
      local.set $color_type
      local.get $color_type
      i32.const 4  ;; Grayscale with alpha
      i32.eq
      local.get $color_type
      i32.const 6  ;; Truecolor with alpha
      i32.eq
      i32.or
      return
    end

    ;; WebP can have alpha
    local.get $format
    i32.const 5
    i32.eq
    if
      i32.const 1  ;; WebP supports alpha
      return
    end

    ;; Default: no alpha
    i32.const 0
  )

  ;; Detect JPEG quality (simplified - checks quantization tables)
  (func $estimate_jpeg_quality (export "estimate_jpeg_quality")
        (param $data_ptr i32) (param $data_len i32) (result i32)
    (local $i i32)
    (local $marker i32)
    (local $quality i32)

    ;; Check JPEG signature first (0xFF 0xD8)
    local.get $data_len
    i32.const 4
    i32.lt_u
    if
      i32.const 0  ;; Not enough data
      return
    end

    local.get $data_ptr
    i32.load8_u
    i32.const 0xFF
    i32.ne
    if
      i32.const 0  ;; Not JPEG
      return
    end

    local.get $data_ptr
    i32.const 1
    i32.add
    i32.load8_u
    i32.const 0xD8
    i32.ne
    if
      i32.const 0  ;; Not JPEG
      return
    end

    ;; Default quality for JPEG
    i32.const 75
    local.set $quality

    ;; Start searching from byte 2
    i32.const 2
    local.set $i

    block $done
      loop $search
        ;; Check bounds
        local.get $i
        i32.const 4
        i32.add
        local.get $data_len
        i32.ge_u
        br_if $done

        ;; Look for DQT marker (0xFF 0xDB)
        local.get $data_ptr
        local.get $i
        i32.add
        i32.load8_u
        i32.const 0xFF
        i32.eq
        if
          local.get $data_ptr
          local.get $i
          i32.const 1
          i32.add
          i32.add
          i32.load8_u
          i32.const 0xDB
          i32.eq
          if
            ;; Found DQT marker
            ;; Analyze quantization values (simplified)
            local.get $data_ptr
            local.get $i
            i32.const 5
            i32.add
            i32.add
            i32.load8_u
            local.set $marker

            ;; Estimate quality based on first quantization value
            local.get $marker
            i32.const 2
            i32.le_u
            if
              i32.const 100  ;; Very high quality
              local.set $quality
            else
              local.get $marker
              i32.const 10
              i32.le_u
              if
                i32.const 90  ;; High quality
                local.set $quality
              else
                local.get $marker
                i32.const 25
                i32.le_u
                if
                  i32.const 75  ;; Medium quality
                  local.set $quality
                else
                  i32.const 50  ;; Lower quality
                  local.set $quality
                end
              end
            end

            br $done
          end
        end

        ;; Move to next byte
        local.get $i
        i32.const 1
        i32.add
        local.set $i

        ;; Continue loop
        local.get $i
        local.get $data_len
        i32.lt_u
        br_if $search
      end
    end

    local.get $quality
  )

  ;; Check if image is progressive/interlaced
  (func $is_progressive (export "is_progressive")
        (param $data_ptr i32) (param $data_len i32) (param $format i32) (result i32)
    (local $i i32)

    ;; Format: 1=JPEG, 2=PNG
    local.get $format
    i32.const 1
    i32.eq
    if
      ;; Check for progressive JPEG (SOF2 marker 0xFFC2)
      i32.const 2
      local.set $i

      block $not_found
        loop $search
          local.get $i
          i32.const 2
          i32.add
          local.get $data_len
          i32.ge_u
          br_if $not_found

          local.get $data_ptr
          local.get $i
          i32.add
          i32.load8_u
          i32.const 0xFF
          i32.eq
          if
            local.get $data_ptr
            local.get $i
            i32.const 1
            i32.add
            i32.add
            i32.load8_u
            i32.const 0xC2
            i32.eq
            if
              i32.const 1  ;; Progressive
              return
            end
          end

          local.get $i
          i32.const 1
          i32.add
          local.set $i

          local.get $i
          local.get $data_len
          i32.lt_u
          br_if $search
        end
      end

      i32.const 0  ;; Not progressive
      return
    end

    ;; For PNG, check interlace method at byte 28
    local.get $format
    i32.const 2
    i32.eq
    if
      local.get $data_len
      i32.const 29
      i32.lt_u
      if
        i32.const 0
        return
      end

      local.get $data_ptr
      i32.const 28
      i32.add
      i32.load8_u
      i32.const 0
      i32.ne  ;; Non-zero means interlaced
      return
    end

    i32.const 0  ;; Default: not progressive
  )

  ;; Calculate simple histogram (writes stats to memory)
  ;; In a real implementation, this would build a full histogram
  (func $calculate_histogram_stats (export "calculate_histogram_stats")
        (param $data_ptr i32) (param $data_len i32) (param $result_ptr i32)
        ;; Writes to result_ptr: average_lum, overexposed_pct, underexposed_pct
    (local $sample_count i32)
    (local $sum i32)
    (local $avg i32)
    (local $i i32)
    (local $overexposed i32)
    (local $underexposed i32)

    ;; Sample first 1000 bytes for quick analysis
    i32.const 0
    local.set $i
    i32.const 0
    local.set $sum
    i32.const 0
    local.set $sample_count

    block $done
      loop $sample
        local.get $i
        i32.const 1000
        i32.ge_u
        br_if $done

        local.get $i
        local.get $data_len
        i32.ge_u
        br_if $done

      ;; Add byte value to sum
      local.get $sum
      local.get $data_ptr
      local.get $i
      i32.add
      i32.load8_u
      i32.add
      local.set $sum

      local.get $sample_count
      i32.const 1
      i32.add
      local.set $sample_count

      local.get $i
      i32.const 1
      i32.add
      local.set $i

        br $sample
      end
    end

    ;; Calculate average
    local.get $sample_count
    i32.const 0
    i32.eq
    if
      ;; Write default values to memory
      local.get $result_ptr
      i32.const 128  ;; Default middle value
      i32.store
      local.get $result_ptr
      i32.const 4
      i32.add
      i32.const 0    ;; Not overexposed
      i32.store
      local.get $result_ptr
      i32.const 8
      i32.add
      i32.const 0    ;; Not underexposed
      i32.store
      return
    end

    local.get $sum
    local.get $sample_count
    i32.div_u
    local.set $avg

    ;; Count overexposed and underexposed samples
    i32.const 0
    local.set $i
    i32.const 0
    local.set $overexposed
    i32.const 0
    local.set $underexposed

    block $count_done
      loop $count
        local.get $i
        local.get $sample_count
        i32.ge_u
        br_if $count_done

        local.get $i
        local.get $data_len
        i32.ge_u
        br_if $count_done

        local.get $data_ptr
        local.get $i
        i32.add
        i32.load8_u
        local.tee $sum  ;; Reuse $sum as temp

        ;; Check if overexposed (> 240)
        i32.const 240
        i32.gt_u
        if
          local.get $overexposed
          i32.const 1
          i32.add
          local.set $overexposed
        end

        local.get $sum
        ;; Check if underexposed (< 15)
        i32.const 15
        i32.lt_u
        if
          local.get $underexposed
          i32.const 1
          i32.add
          local.set $underexposed
        end

        local.get $i
        i32.const 1
        i32.add
        local.set $i

        br $count
      end
    end

    ;; Calculate percentages (multiply by 100, divide by sample_count)
    local.get $overexposed
    i32.const 100
    i32.mul
    local.get $sample_count
    i32.div_u
    local.set $overexposed

    local.get $underexposed
    i32.const 100
    i32.mul
    local.get $sample_count
    i32.div_u
    local.set $underexposed

    ;; Write results to memory
    local.get $result_ptr
    local.get $avg
    i32.store

    local.get $result_ptr
    i32.const 4
    i32.add
    local.get $overexposed
    i32.store

    local.get $result_ptr
    i32.const 8
    i32.add
    local.get $underexposed
    i32.store
  )

  ;; Extract PNG dimensions (required for basic interface)
  (func $extract_png_dimensions (export "extract_png_dimensions")
        (param $data_ptr i32) (param $data_len i32) (result i32 i32)
    ;; Check PNG signature and length
    local.get $data_len
    i32.const 24
    i32.lt_u
    if
      i32.const 0
      i32.const 0
      return
    end

    ;; Check PNG signature
    local.get $data_ptr
    i32.load8_u
    i32.const 0x89
    i32.ne
    if
      i32.const 0
      i32.const 0
      return
    end

    ;; Width is at bytes 16-19 (big-endian)
    local.get $data_ptr
    i32.const 16
    i32.add
    i32.load8_u
    i32.const 24
    i32.shl
    local.get $data_ptr
    i32.const 17
    i32.add
    i32.load8_u
    i32.const 16
    i32.shl
    i32.or
    local.get $data_ptr
    i32.const 18
    i32.add
    i32.load8_u
    i32.const 8
    i32.shl
    i32.or
    local.get $data_ptr
    i32.const 19
    i32.add
    i32.load8_u
    i32.or

    ;; Height is at bytes 20-23 (big-endian)
    local.get $data_ptr
    i32.const 20
    i32.add
    i32.load8_u
    i32.const 24
    i32.shl
    local.get $data_ptr
    i32.const 21
    i32.add
    i32.load8_u
    i32.const 16
    i32.shl
    i32.or
    local.get $data_ptr
    i32.const 22
    i32.add
    i32.load8_u
    i32.const 8
    i32.shl
    i32.or
    local.get $data_ptr
    i32.const 23
    i32.add
    i32.load8_u
    i32.or
  )

  ;; Extract JPEG dimensions (required for basic interface)
  (func $extract_jpeg_dimensions (export "extract_jpeg_dimensions")
        (param $data_ptr i32) (param $data_len i32) (result i32 i32)
    (local $i i32)
    (local $width i32)
    (local $height i32)

    ;; Check JPEG signature
    local.get $data_len
    i32.const 10
    i32.lt_u
    if
      i32.const 0
      i32.const 0
      return
    end

    local.get $data_ptr
    i32.load8_u
    i32.const 0xFF
    i32.ne
    if
      i32.const 0
      i32.const 0
      return
    end

    local.get $data_ptr
    i32.const 1
    i32.add
    i32.load8_u
    i32.const 0xD8
    i32.ne
    if
      i32.const 0
      i32.const 0
      return
    end

    ;; Search for SOF0 marker (0xFFC0)
    i32.const 2
    local.set $i

    block $found
      loop $search
        local.get $i
        i32.const 8
        i32.add
        local.get $data_len
        i32.ge_u
        br_if $found

        local.get $data_ptr
        local.get $i
        i32.add
        i32.load8_u
        i32.const 0xFF
        i32.eq
        if
          local.get $data_ptr
          local.get $i
          i32.const 1
          i32.add
          i32.add
          i32.load8_u
          i32.const 0xC0
          i32.eq
          if
            ;; Found SOF0, extract dimensions
            ;; Height at i+5 and i+6 (big-endian)
            local.get $data_ptr
            local.get $i
            i32.const 5
            i32.add
            i32.add
            i32.load8_u
            i32.const 8
            i32.shl
            local.get $data_ptr
            local.get $i
            i32.const 6
            i32.add
            i32.add
            i32.load8_u
            i32.or
            local.set $height

            ;; Width at i+7 and i+8 (big-endian)
            local.get $data_ptr
            local.get $i
            i32.const 7
            i32.add
            i32.add
            i32.load8_u
            i32.const 8
            i32.shl
            local.get $data_ptr
            local.get $i
            i32.const 8
            i32.add
            i32.add
            i32.load8_u
            i32.or
            local.set $width

            local.get $width
            local.get $height
            return
          end
        end

        local.get $i
        i32.const 1
        i32.add
        local.set $i
        br $search
      end
    end

    i32.const 0
    i32.const 0
  )

  ;; Extract basic metadata (required for basic interface)
  (func $extract_metadata (export "extract_metadata")
        (param $data_ptr i32) (param $data_len i32) (result i32)
    (local $format i32)
    (local $width i32)
    (local $height i32)
    (local $result_ptr i32)

    ;; Allocate result memory (16 bytes: format, width, height, size)
    i32.const 16
    call $malloc
    local.set $result_ptr

    ;; Detect format
    local.get $data_ptr
    local.get $data_len
    call $detect_format
    local.set $format

    ;; Store format
    local.get $result_ptr
    local.get $format
    i32.store

    ;; Get dimensions based on format
    local.get $format
    i32.const 1  ;; JPEG
    i32.eq
    if
      local.get $data_ptr
      local.get $data_len
      call $extract_jpeg_dimensions
      local.set $height
      local.set $width
    else
      local.get $format
      i32.const 2  ;; PNG
      i32.eq
      if
        local.get $data_ptr
        local.get $data_len
        call $extract_png_dimensions
        local.set $height
        local.set $width
      else
        i32.const 100  ;; Default dimensions
        local.set $width
        i32.const 100
        local.set $height
      end
    end

    ;; Store width, height, size
    local.get $result_ptr
    i32.const 4
    i32.add
    local.get $width
    i32.store

    local.get $result_ptr
    i32.const 8
    i32.add
    local.get $height
    i32.store

    local.get $result_ptr
    i32.const 12
    i32.add
    local.get $data_len
    i32.store

    local.get $result_ptr
  )

  ;; Find EXIF data offset
  (func $find_exif_offset (export "find_exif_offset")
        (param $data_ptr i32) (param $data_len i32) (result i32)
    (local $i i32)

    ;; Look for EXIF marker (0xFF 0xE1)
    i32.const 2
    local.set $i

    loop $search
      local.get $i
      i32.const 10
      i32.add
      local.get $data_len
      i32.ge_u
      if
        i32.const 0  ;; Not found
        return
      end

      ;; Check for APP1 marker
      local.get $data_ptr
      local.get $i
      i32.add
      i32.load8_u
      i32.const 0xFF
      i32.eq
      if
        local.get $data_ptr
        local.get $i
        i32.const 1
        i32.add
        i32.add
        i32.load8_u
        i32.const 0xE1
        i32.eq
        if
          ;; Check for "Exif" identifier
          local.get $data_ptr
          local.get $i
          i32.const 4
          i32.add
          i32.add
          i32.load8_u
          i32.const 0x45  ;; 'E'
          i32.eq
          if
            local.get $data_ptr
            local.get $i
            i32.const 5
            i32.add
            i32.add
            i32.load8_u
            i32.const 0x78  ;; 'x'
            i32.eq
            if
              ;; Found EXIF data
              local.get $i
              i32.const 10  ;; Skip to actual EXIF data
              i32.add
              return
            end
          end
        end
      end

      local.get $i
      i32.const 1
      i32.add
      local.set $i

      br $search
    end

    i32.const 0  ;; Not found
  )

  ;; Main analysis function - returns packed metadata
  (func $analyze_image (export "analyze_image")
        (param $data_ptr i32) (param $data_len i32) (param $result_ptr i32)
    (local $format i32)
    (local $width i32)
    (local $height i32)
    (local $bit_depth i32)
    (local $has_alpha i32)
    (local $quality i32)
    (local $is_prog i32)
    (local $avg_lum i32)
    (local $overexposed i32)
    (local $underexposed i32)
    (local $exif_offset i32)

    ;; Detect format first (reuse detect_format function)
    local.get $data_ptr
    local.get $data_len
    call $detect_format
    local.set $format

    ;; Get dimensions based on format
    local.get $format
    i32.const 1  ;; JPEG
    i32.eq
    if
      local.get $data_ptr
      local.get $data_len
      call $extract_jpeg_dimensions
      local.set $height
      local.set $width
    else
      local.get $format
      i32.const 2  ;; PNG
      i32.eq
      if
        local.get $data_ptr
        local.get $data_len
        call $extract_png_dimensions
        local.set $height
        local.set $width
      else
        i32.const 100  ;; Default dimensions
        local.set $width
        i32.const 100
        local.set $height
      end
    end

    ;; Get bit depth (PNG only for now)
    local.get $format
    i32.const 2
    i32.eq
    if
      local.get $data_ptr
      local.get $data_len
      call $detect_png_bit_depth
      local.set $bit_depth
    else
      i32.const 8  ;; Default 8-bit
      local.set $bit_depth
    end

    ;; Check alpha channel
    local.get $data_ptr
    local.get $data_len
    local.get $format
    call $has_alpha_channel
    local.set $has_alpha

    ;; Estimate JPEG quality
    local.get $format
    i32.const 1
    i32.eq
    if
      local.get $data_ptr
      local.get $data_len
      call $estimate_jpeg_quality
      local.set $quality
    else
      i32.const 0
      local.set $quality
    end

    ;; Check progressive/interlaced
    local.get $data_ptr
    local.get $data_len
    local.get $format
    call $is_progressive
    local.set $is_prog

    ;; Get histogram stats
    ;; Use temporary space at end of result buffer
    local.get $data_ptr
    local.get $data_len
    local.get $result_ptr
    i32.const 48           ;; Offset into result buffer for temp storage
    i32.add
    call $calculate_histogram_stats

    ;; Read histogram results from memory
    local.get $result_ptr
    i32.const 48
    i32.add
    i32.load
    local.set $avg_lum

    local.get $result_ptr
    i32.const 52
    i32.add
    i32.load
    local.set $overexposed

    local.get $result_ptr
    i32.const 56
    i32.add
    i32.load
    local.set $underexposed

    ;; Find EXIF offset
    local.get $data_ptr
    local.get $data_len
    call $find_exif_offset
    local.set $exif_offset

    ;; Pack results as 32-bit values
    local.get $result_ptr
    local.get $format
    i32.store offset=0  ;; format at offset 0

    local.get $result_ptr
    local.get $width
    i32.store offset=4  ;; width at offset 4

    local.get $result_ptr
    local.get $height
    i32.store offset=8  ;; height at offset 8

    local.get $result_ptr
    local.get $data_len
    i32.store offset=12  ;; size at offset 12

    local.get $result_ptr
    local.get $bit_depth
    i32.store offset=16  ;; bit depth at offset 16

    local.get $result_ptr
    local.get $has_alpha
    i32.store offset=20  ;; has alpha at offset 20

    local.get $result_ptr
    local.get $quality
    i32.store offset=24  ;; quality at offset 24

    local.get $result_ptr
    local.get $is_prog
    i32.store offset=28  ;; progressive at offset 28

    local.get $result_ptr
    local.get $avg_lum
    i32.store offset=32  ;; average luminance at offset 32

    local.get $result_ptr
    local.get $overexposed
    i32.store offset=36  ;; overexposed at offset 36

    local.get $result_ptr
    local.get $underexposed
    i32.store offset=40  ;; underexposed at offset 40

    local.get $result_ptr
    local.get $exif_offset
    i32.store offset=44  ;; EXIF offset at offset 44

    ;; Ensure stack is empty (safety)
    drop
  )

  ;; Include the original detect_format function
  (func $detect_format (export "detect_format") (param $data_ptr i32) (param $data_len i32) (result i32)
    ;; Check if we have at least 4 bytes
    local.get $data_len
    i32.const 4
    i32.lt_u
    if
      i32.const 0
      return
    end

    ;; Check for JPEG (0xFF 0xD8 0xFF)
    local.get $data_ptr
    i32.load8_u
    i32.const 0xFF
    i32.eq
    if
      local.get $data_ptr
      i32.const 1
      i32.add
      i32.load8_u
      i32.const 0xD8
      i32.eq
      if
        local.get $data_ptr
        i32.const 2
        i32.add
        i32.load8_u
        i32.const 0xFF
        i32.eq
        if
          i32.const 1  ;; JPEG
          return
        end
      end
    end

    ;; Check for PNG
    local.get $data_ptr
    i32.load8_u
    i32.const 0x89
    i32.eq
    if
      local.get $data_ptr
      i32.const 1
      i32.add
      i32.load8_u
      i32.const 0x50
      i32.eq
      if
        i32.const 2  ;; PNG
        return
      end
    end

    ;; Check for GIF
    local.get $data_ptr
    i32.load8_u
    i32.const 0x47
    i32.eq
    if
      local.get $data_ptr
      i32.const 1
      i32.add
      i32.load8_u
      i32.const 0x49
      i32.eq
      if
        i32.const 3  ;; GIF
        return
      end
    end

    ;; Check for BMP
    local.get $data_ptr
    i32.load8_u
    i32.const 0x42
    i32.eq
    if
      local.get $data_ptr
      i32.const 1
      i32.add
      i32.load8_u
      i32.const 0x4D
      i32.eq
      if
        i32.const 4  ;; BMP
        return
      end
    end

    ;; Check for WebP
    local.get $data_len
    i32.const 12
    i32.ge_u
    if
      local.get $data_ptr
      i32.load8_u
      i32.const 0x52
      i32.eq
      if
        local.get $data_ptr
        i32.const 8
        i32.add
        i32.load8_u
        i32.const 0x57
        i32.eq
        if
          i32.const 5  ;; WebP
          return
        end
      end
    end

    i32.const 0  ;; Unknown
  )
)