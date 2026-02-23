<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import {
  ZoomIn,
  ZoomOut,
  Move,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Maximize2,
  Loader2,
  Image as ImageIcon,
  Eye,
  Sun,
  SunMedium,
  Bone,
  Brain,
  Activity,
  RefreshCw
} from 'lucide-vue-next';
// @ts-ignore - dicom-parser is installed
import dicomParser from 'dicom-parser';

interface Props {
  studyId?: number;
}

const props = defineProps<Props>();

// ============ STATE ============
const viewerContainer = ref<HTMLElement | null>(null);
const canvasElement = ref<HTMLCanvasElement | null>(null);
const isLoading = ref(true);
const error = ref<string | null>(null);
const imageLoaded = ref(false);

// Viewer state
const zoom = ref(100);
const rotation = ref(0);
const flipH = ref(false);
const flipV = ref(false);
const windowCenter = ref(40);
const windowWidth = ref(400);
const brightness = ref(0);
const contrast = ref(0);

// DICOM data
const dicomData = ref<any>(null);
const pixelData = ref<Uint8Array | Uint16Array | null>(null);
const rows = ref(0);
const cols = ref(0);
const bitsAllocated = ref(16);
const rescaleSlope = ref(1);
const rescaleIntercept = ref(0);
const isSigned = ref(false);

// Image display
const displayImage = ref<ImageData | null>(null);

// Tools
const tools = [
  { id: 'windowLevel', label: 'W/L', icon: SunMedium, shortcut: 'W' },
  { id: 'zoom', label: 'Zoom', icon: ZoomIn, shortcut: 'Z' },
  { id: 'pan', label: 'Pan', icon: Move, shortcut: 'P' },
];

// Presets
const presets = [
  { label: 'Soft Tissue', center: 40, width: 400, icon: Activity },
  { label: 'Lung', center: -600, width: 1500, icon: Activity },
  { label: 'Bone', center: 300, width: 1500, icon: Bone },
  { label: 'Brain', center: 40, width: 80, icon: Brain },
];

// ============ METHODS ============

const loadDicom = async () => {
  if (!props.studyId) {
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  error.value = null;
  imageLoaded.value = false;

  try {
    // Fetch the DICOM file
    const response = await fetch(`/radiology/studies/${props.studyId}/image`, {
      headers: {
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
      },
    });

    if (!response.ok) {
      if (response.status === 415) {
        // DICOM viewer needed
        const json = await response.json();
        error.value = json.message || 'DICOM requires specialized viewer';
        return;
      }
      throw new Error(`Failed to load image: ${response.status}`);
    }

    // Get the array buffer
    const arrayBuffer = await response.arrayBuffer();
    const byteArray = new Uint8Array(arrayBuffer);
    
    // Debug: Log first bytes to see if it's valid DICOM
    console.log('First 132 bytes:', Array.from(byteArray.slice(128, 132)));
    const preamble = String.fromCharCode(...byteArray.slice(128, 132));
    console.log('Preamble check:', preamble); // Should be 'DICM'
    
    // Check content type
    const contentType = response.headers.get('Content-Type') || '';
    console.log('Content-Type:', contentType);

    // Try parsing as standard image first
    if (contentType.includes('image/')) {
      // It's a standard image (PNG, JPG)
      const blob = new Blob([arrayBuffer], { type: contentType });
      const url = URL.createObjectURL(blob);
      await loadStandardImage(url);
      return;
    }

    // Parse DICOM
    try {
      dicomData.value = dicomParser.parseDicom(byteArray);
    } catch (parseError: any) {
      console.error('DICOM parse error:', parseError);
      // Try as standard image anyway
      const blob = new Blob([arrayBuffer], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      await loadStandardImage(url);
      return;
    }

    // Extract essential DICOM tags
    extractDicomTags();
    
    // Extract pixel data
    extractPixelData(byteArray);
    
    // Render the image
    renderDicomImage();
    
    imageLoaded.value = true;
  } catch (e: any) {
    console.error('Failed to load DICOM:', e);
    error.value = e.message || 'Failed to load image';
  } finally {
    isLoading.value = false;
  }
};

const loadStandardImage = async (url: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (!canvasElement.value) return;
      const ctx = canvasElement.value.getContext('2d');
      if (!ctx) return;
      
      canvasElement.value.width = img.width;
      canvasElement.value.height = img.height;
      ctx.drawImage(img, 0, 0);
      imageLoaded.value = true;
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });
};

const extractDicomTags = () => {
  if (!dicomData.value) return;
  
  try {
    // Get image dimensions
    rows.value = dicomData.value.elements['x00280010']?.Items?.[0]?.Value?.[0] || 0;
    cols.value = dicomData.value.elements['x00280011']?.Items?.[0]?.Value?.[0] || 0;
    bitsAllocated.value = dicomData.value.elements['x00280100']?.Items?.[0]?.Value?.[0] || 16;
    
    // Get window/level
    const wc = dicomData.value.elements['x00281050']?.Value?.[0];
    const ww = dicomData.value.elements['x00281051']?.Value?.[0];
    if (wc) windowCenter.value = wc;
    if (ww) windowWidth.value = ww;
    
    // Get rescale values
    const rs = dicomData.value.elements['x00281053']?.Value?.[0];
    const ri = dicomData.value.elements['x00281052']?.Value?.[0];
    if (rs) rescaleSlope.value = rs;
    if (ri) rescaleIntercept.value = ri;
    
    // Check for signed/unsigned
    const pixelRepresentation = dicomData.value.elements['x00280103']?.Value?.[0];
    isSigned.value = pixelRepresentation === 1;
    
    console.log('DICOM tags:', { rows: rows.value, cols: cols.value, bits: bitsAllocated.value });
  } catch (e) {
    console.error('Error extracting DICOM tags:', e);
  }
};

const extractPixelData = (byteArray: Uint8Array) => {
  if (!dicomData.value) return;
  
  try {
    // Try to find pixel data in the DICOM dataset
    // The pixel data is usually in element x7fe00010
    const pixelDataElement = dicomData.value.elements['x7fe00010'];
    
    if (pixelDataElement && pixelDataElement.Length) {
      // Get the raw pixel data from the byte array
      const pixelDataRaw = new Uint8Array(byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.Length);
      pixelData.value = pixelDataRaw;
      console.log('Found pixel data:', pixelDataRaw.length, 'bytes');
    } else {
      console.log('No pixel data element found in DICOM');
    }
  } catch (e) {
    console.error('Error extracting pixel data:', e);
  }
};

const renderDicomImage = () => {
  if (!canvasElement.value || !dicomData.value) {
    error.value = 'No DICOM data to render';
    return;
  }
  
  const ctx = canvasElement.value.getContext('2d');
  if (!ctx) return;
  
  // If we have rows/cols, use them
  if (rows.value > 0 && cols.value > 0) {
    canvasElement.value.width = cols.value;
    canvasElement.value.height = rows.value;
    
    // Try to render from pixel data if available
    if (pixelData.value && pixelData.value.length > 0) {
      renderFromPixelData(ctx);
    } else {
      // Show placeholder
      renderPlaceholder(ctx);
    }
  } else {
    // Default size - show placeholder
    canvasElement.value.width = 512;
    canvasElement.value.height = 512;
    renderPlaceholder(ctx);
  }
};

const renderFromPixelData = (ctx: CanvasRenderingContext2D) => {
  if (!pixelData.value) return;
  
  const width = cols.value || 512;
  const height = rows.value || 512;
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  // Apply window/level
  const wc = windowCenter.value;
  const ww = windowWidth.value;
  const slope = rescaleSlope.value;
  const intercept = rescaleIntercept.value;
  
  for (let i = 0; i < pixelData.value.length; i++) {
    // Apply rescale
    let value = pixelData.value[i] * slope + intercept;
    
    // Apply window/level
    const normalized = (value - (wc - ww / 2)) / ww;
    let output = Math.max(0, Math.min(255, normalized * 255));
    
    // Set RGBA
    const idx = i * 4;
    data[idx] = output;     // R
    data[idx + 1] = output; // G
    data[idx + 2] = output; // B
    data[idx + 3] = 255;    // A
  }
  
  ctx.putImageData(imageData, 0, 0);
};

const renderPlaceholder = (ctx: CanvasRenderingContext2D) => {
  // Draw a placeholder indicating DICOM was loaded
  const width = canvasElement.value?.width || 512;
  const height = canvasElement.value?.height || 512;
  
  // Gray background
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, width, height);
  
  // Draw some lines to simulate X-ray
  ctx.strokeStyle = '#404040';
  ctx.lineWidth = 1;
  for (let i = 0; i < height; i += 4) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(width, i);
    ctx.stroke();
  }
  
  // Text
  ctx.fillStyle = '#888';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DICOM Data Loaded', width / 2, height / 2 - 20);
  ctx.fillText(`${cols.value} x ${rows.value}`, width / 2, height / 2 + 10);
  ctx.fillText(`Bits: ${bitsAllocated.value}`, width / 2, height / 2 + 40);
};

// ============ WATCHERS ============
watch(() => props.studyId, () => {
  loadDicom();
});

watch([windowCenter, windowWidth], () => {
  if (pixelData.value) {
    const ctx = canvasElement.value?.getContext('2d');
    if (ctx) renderFromPixelData(ctx);
  }
});

// ============ LIFECYCLE ============
onMounted(() => {
  loadDicom();
});

onUnmounted(() => {
  // Cleanup
});

// ============ EXTERNAL CONTROL ============
defineExpose({
  loadDicom,
  zoom,
  rotation,
  flipH,
  flipV,
  windowCenter,
  windowWidth,
});
</script>

<template>
  <div class="dicom-viewer" ref="viewerContainer">
    <!-- Loading State -->
    <div v-if="isLoading" class="loading-overlay">
      <Loader2 class="animate-spin h-8 w-8 text-blue-500" />
      <span class="mt-2 text-gray-400">Loading DICOM...</span>
    </div>
    
    <!-- Error State -->
    <div v-else-if="error" class="error-overlay">
      <div class="text-center p-4">
        <ImageIcon class="h-12 w-12 text-yellow-500 mx-auto mb-2" />
        <p class="text-yellow-400 font-medium">{{ error }}</p>
        <p class="text-gray-500 text-sm mt-2">
          DICOM files require specialized rendering. Standard images are supported.
        </p>
        <button 
          @click="loadDicom"
          class="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm flex items-center mx-auto"
        >
          <RefreshCw class="h-4 w-4 mr-2" />
          Retry
        </button>
      </div>
    </div>
    
    <!-- Canvas -->
    <div v-else class="canvas-container" :style="{ transform: `scale(${zoom / 100}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})` }">
      <canvas ref="canvasElement" class="dicom-canvas"></canvas>
    </div>
    
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="tool-group">
        <!-- Zoom -->
        <button 
          @click="zoom = Math.max(10, zoom - 10)"
          class="tool-btn"
          title="Zoom Out"
        >
          <ZoomOut class="h-4 w-4" />
        </button>
        <span class="zoom-value">{{ zoom }}%</span>
        <button 
          @click="zoom = Math.min(400, zoom + 10)"
          class="tool-btn"
          title="Zoom In"
        >
          <ZoomIn class="h-4 w-4" />
        </button>
      </div>
      
      <div class="tool-group">
        <!-- Rotation -->
        <button 
          @click="rotation = (rotation + 90) % 360"
          class="tool-btn"
          title="Rotate"
        >
          <RotateCw class="h-4 w-4" />
        </button>
      </div>
      
      <div class="tool-group">
        <!-- Flip -->
        <button 
          @click="flipH = !flipH"
          class="tool-btn"
          :class="{ active: flipH }"
          title="Flip Horizontal"
        >
          <FlipHorizontal class="h-4 w-4" />
        </button>
        <button 
          @click="flipV = !flipV"
          class="tool-btn"
          :class="{ active: flipV }"
          title="Flip Vertical"
        >
          <FlipVertical class="h-4 w-4" />
        </button>
      </div>
      
      <div class="tool-group">
        <!-- Window/Level Presets -->
        <button 
          v-for="preset in presets" 
          :key="preset.label"
          @click="windowCenter = preset.center; windowWidth = preset.width"
          class="tool-btn text-xs"
          :title="preset.label"
        >
          {{ preset.label }}
        </button>
      </div>
    </div>
    
    <!-- Info Panel -->
    <div class="info-panel">
      <div class="info-item">
        <span class="label">W/L:</span>
        <span class="value">{{ windowCenter }} / {{ windowWidth }}</span>
      </div>
      <div v-if="rows && cols" class="info-item">
        <span class="label">Size:</span>
        <span class="value">{{ cols }} x {{ rows }}</span>
      </div>
      <div class="info-item">
        <span class="label">Bits:</span>
        <span class="value">{{ bitsAllocated }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dicom-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
  background: #0a0a0a;
  border-radius: 8px;
  overflow: hidden;
}

.loading-overlay,
.error-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
  z-index: 10;
}

.canvas-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: center center;
}

.dicom-canvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.toolbar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 8px;
  backdrop-filter: blur(8px);
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border-right: 1px solid #333;
}

.tool-group:last-child {
  border-right: none;
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  background: transparent;
  color: #888;
  transition: all 0.2s;
}

.tool-btn:hover {
  background: #333;
  color: #fff;
}

.tool-btn.active {
  background: #2563eb;
  color: #fff;
}

.tool-btn.text-xs {
  width: auto;
  padding: 0 8px;
  font-size: 11px;
}

.zoom-value {
  font-size: 12px;
  color: #888;
  min-width: 48px;
  text-align: center;
}

.info-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 4px;
  font-size: 12px;
}

.info-item {
  display: flex;
  gap: 8px;
}

.info-item .label {
  color: #666;
}

.info-item .value {
  color: #ccc;
  font-family: monospace;
}
</style>
