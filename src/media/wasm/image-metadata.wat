;; WebAssembly Text Format for basic image metadata extraction
;; This is a minimal implementation for demonstration
;; Production would use Rust or C++ compiled to WASM

(module
  ;; Memory: 1 page (64KB) initially, max 256 pages (16MB)
  (memory (export "memory") 1 256)

  ;; Table for function pointers
  (table (export "table") 1 funcref)

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

  ;; Function to free memory (simplified - just resets heap)
  (func $free (export "free") (param $ptr i32)
    ;; In a real implementation, we'd have proper memory management
    nop
  )

  ;; Function to detect image format from magic bytes
  ;; Returns: 1=JPEG, 2=PNG, 3=GIF, 4=BMP, 5=WEBP, 0=Unknown
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

    ;; Check for PNG (0x89 0x50 0x4E 0x47)
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
        local.get $data_ptr
        i32.const 2
        i32.add
        i32.load8_u
        i32.const 0x4E
        i32.eq
        if
          local.get $data_ptr
          i32.const 3
          i32.add
          i32.load8_u
          i32.const 0x47
          i32.eq
          if
            i32.const 2  ;; PNG
            return
          end
        end
      end
    end

    ;; Check for GIF (GIF87a or GIF89a)
    local.get $data_ptr
    i32.load8_u
    i32.const 0x47  ;; 'G'
    i32.eq
    if
      local.get $data_ptr
      i32.const 1
      i32.add
      i32.load8_u
      i32.const 0x49  ;; 'I'
      i32.eq
      if
        local.get $data_ptr
        i32.const 2
        i32.add
        i32.load8_u
        i32.const 0x46  ;; 'F'
        i32.eq
        if
          i32.const 3  ;; GIF
          return
        end
      end
    end

    ;; Check for BMP (0x42 0x4D)
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

    ;; Check for WebP (RIFF....WEBP)
    local.get $data_len
    i32.const 12
    i32.ge_u
    if
      local.get $data_ptr
      i32.load8_u
      i32.const 0x52  ;; 'R'
      i32.eq
      if
        local.get $data_ptr
        i32.const 1
        i32.add
        i32.load8_u
        i32.const 0x49  ;; 'I'
        i32.eq
        if
          local.get $data_ptr
          i32.const 2
          i32.add
          i32.load8_u
          i32.const 0x46  ;; 'F'
          i32.eq
          if
            local.get $data_ptr
            i32.const 3
            i32.add
            i32.load8_u
            i32.const 0x46  ;; 'F'
            i32.eq
            if
              local.get $data_ptr
              i32.const 8
              i32.add
              i32.load8_u
              i32.const 0x57  ;; 'W'
              i32.eq
              if
                i32.const 5  ;; WebP
                return
              end
            end
          end
        end
      end
    end

    i32.const 0  ;; Unknown
  )

  ;; Extract PNG dimensions (simplified)
  (func $extract_png_dimensions (export "extract_png_dimensions")
        (param $data_ptr i32) (param $data_len i32)
        (result i32 i32)  ;; Returns width, height
    (local $width i32)
    (local $height i32)

    ;; PNG IHDR chunk starts at byte 16
    local.get $data_len
    i32.const 24
    i32.lt_u
    if
      i32.const 0
      i32.const 0
      return
    end

    ;; Read width (big-endian) at offset 16
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
    local.set $width

    ;; Read height (big-endian) at offset 20
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
    local.set $height

    local.get $width
    local.get $height
  )

  ;; Extract JPEG dimensions (simplified - finds SOF0 marker)
  (func $extract_jpeg_dimensions (export "extract_jpeg_dimensions")
        (param $data_ptr i32) (param $data_len i32)
        (result i32 i32)  ;; Returns width, height
    (local $i i32)
    (local $marker i32)
    (local $width i32)
    (local $height i32)

    ;; Start searching from byte 2
    i32.const 2
    local.set $i

    block $done
      loop $search
        ;; Check bounds
        local.get $i
        i32.const 9
        i32.add
        local.get $data_len
        i32.ge_u
        br_if $done

        ;; Look for marker (0xFF followed by marker code)
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
          local.set $marker

          ;; Check for SOF0 (0xC0) or SOF2 (0xC2)
          local.get $marker
          i32.const 0xC0
          i32.eq
          local.get $marker
          i32.const 0xC2
          i32.eq
          i32.or
          if
            ;; Found SOF marker
            ;; Height is at offset i+5 (big-endian)
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

            ;; Width is at offset i+7 (big-endian)
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

            br $done
          end

          ;; Skip this segment
          local.get $i
          i32.const 2
          i32.add
          local.set $i
        else
          ;; Move to next byte
          local.get $i
          i32.const 1
          i32.add
          local.set $i
        end

        ;; Continue loop if not at end
        local.get $i
        local.get $data_len
        i32.lt_u
        br_if $search
      end
    end

    local.get $width
    local.get $height
  )

  ;; Main metadata extraction function
  ;; Returns pointer to metadata structure
  (func $extract_metadata (export "extract_metadata")
        (param $data_ptr i32) (param $data_len i32)
        (result i32)
    (local $format i32)
    (local $width i32)
    (local $height i32)
    (local $result_ptr i32)

    ;; Detect format
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
        ;; Default dimensions for other formats
        i32.const 0
        local.set $width
        i32.const 0
        local.set $height
      end
    end

    ;; Allocate memory for result (16 bytes)
    i32.const 16
    call $malloc
    local.set $result_ptr

    ;; Store format at offset 0
    local.get $result_ptr
    local.get $format
    i32.store

    ;; Store width at offset 4
    local.get $result_ptr
    i32.const 4
    i32.add
    local.get $width
    i32.store

    ;; Store height at offset 8
    local.get $result_ptr
    i32.const 8
    i32.add
    local.get $height
    i32.store

    ;; Store size at offset 12
    local.get $result_ptr
    i32.const 12
    i32.add
    local.get $data_len
    i32.store

    local.get $result_ptr
  )
)