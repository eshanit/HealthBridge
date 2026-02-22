<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { 
  ZoomIn, 
  ZoomOut, 
  Move, 
  RotateCw, 
  FlipHorizontal, 
  FlipVertical,
  Maximize2,
  Play,
  Pause,
  Layers,
  Ruler,
  MessageSquare,
  Settings,
  Image,
  Loader2,
  MousePointer2
} from 'lucide-vue-next';

// VueUse composables
import { 
  useWindowSize, 
  useMouse, 
  useMagicKeys, 
  useElementSize,
  useDebounceFn,
  useLocalStorage,
  useMediaQuery,
  whenever
} from '@vueuse/core';

interface Props {
  studyId?: number;
  studyInstanceUid?: string;
}

const props = defineProps<Props>();

// Window size for responsive adjustments
const { width: windowSizeWidth, height: windowSizeHeight } = useWindowSize();

// Mouse tracking for window/level tool
const { x: mouseX, y: mouseY, sourceType } = useMouse();
const isMouseOverViewer = ref(false);

// Element size for viewport synchronization
const viewerContainer = ref<HTMLElement | null>(null);
const { width: viewerWidth, height: viewerHeight } = useElementSize(viewerContainer);

// Keyboard shortcuts with useMagicKeys
const keys = useMagicKeys({
  passive: false,
  onEventFired(e) {
    // Ignore if typing in input
    if ((e.target as HTMLElement).tagName === 'INPUT' || 
        (e.target as HTMLElement).tagName === 'TEXTAREA' ||
        (e.target as HTMLElement).tagName === 'SELECT') {
      return;
    }
  },
});

// Key combinations
const Ctrl_S = keys['Ctrl+S'];
const Ctrl_Shift_F = keys['Ctrl+Shift+F'];
const Space = keys['Space'];
const Escape = keys['Escape'];
const ArrowLeft = keys['ArrowLeft'];
const ArrowRight = keys['ArrowRight'];
const PageUp = keys['PageUp'];
const PageDown = keys['PageDown'];
const Home = keys['Home'];
const End = keys['End'];

// Tool shortcuts
const W_Key = keys['w'];
const Z_Key = keys['z'];
const P_Key = keys['p'];
const M_Key = keys['m'];
const A_Key = keys['a'];
const R_Key = keys['r'];
const NumberKeys = [keys['1'], keys['2'], keys['3'], keys['4'], keys['5']];

// Persist user preferences
const userPreferences = useLocalStorage('dicom-viewer-preferences', {
  defaultTool: 'windowLevel',
  defaultZoom: 100,
  showAnnotations: true,
  autoPlay: false,
  playbackSpeed: 2,
});

// Responsive breakpoints
const isMobile = useMediaQuery('(max-width: 768px)');
const isTablet = useMediaQuery('(max-width: 1024px)');

// Debounced functions for performance
const debouncedAutoSave = useDebounceFn(() => {
  console.log('Auto-saving viewport state...');
}, 500);

// Watchers for keyboard shortcuts
watch(Ctrl_S, (pressed) => {
  if (pressed) {
    debouncedAutoSave();
  }
});

watch(Space, (pressed) => {
  if (pressed) {
    togglePlay();
  }
});

watch(ArrowLeft, (pressed) => {
  if (pressed) prevImage();
});

watch(ArrowRight, (pressed) => {
  if (pressed) nextImage();
});

watch(W_Key, (pressed) => {
  if (pressed) setTool('windowLevel');
});

watch(Z_Key, (pressed) => {
  if (pressed) setTool('zoom');
});

watch(P_Key, (pressed) => {
  if (pressed) setTool('pan');
});

watch(M_Key, (pressed) => {
  if (pressed) setTool('measure');
});

watch(R_Key, (pressed) => {
  if (pressed) rotate(90);
});

// Number key presets
NumberKeys.forEach((key, index) => {
  watch(key, (pressed) => {
    if (pressed && wlPresets[index]) {
      applyPreset(wlPresets[index]);
    }
  });
});

// ============ VIEWER STATE ============

// Tool state
const activeTool = ref<'windowLevel' | 'zoom' | 'pan' | 'measure' | 'annotate'>('windowLevel');
const zoom = ref(100);
const rotation = ref(0);
const flipH = ref(false);
const flipV = ref(false);
const windowCenter = ref(40);
const windowWidth = ref(400);
const isPlaying = ref(false);

// Image list (placeholder)
const images = ref<Array<{ id: number; instanceNumber: number }>>([]);
const currentImageIndex = ref(0);
const totalImages = computed(() => images.value.length);

// Loading/error states
const isLoading = ref(true);
const isLoaded = ref(false);
const error = ref<string | null>(null);

// Tools configuration
const tools = [
  { id: 'windowLevel', label: 'W/L', icon: Layers, shortcut: 'W' },
  { id: 'zoom', label: 'Zoom', icon: ZoomIn, shortcut: 'Z' },
  { id: 'pan', label: 'Pan', icon: Move, shortcut: 'P' },
  { id: 'measure', label: 'Measure', icon: Ruler, shortcut: 'M' },
  { id: 'annotate', label: 'Annotate', icon: MessageSquare, shortcut: 'A' },
];

// Window/Level presets
const wlPresets = [
  { label: 'Soft Tissue', center: 40, width: 400 },
  { label: 'Lung', center: -600, width: 1500 },
  { label: 'Bone', center: 300, width: 1500 },
  { label: 'Brain', center: 40, width: 80 },
  { label: 'Liver', center: 60, width: 150 },
];

// ============ METHODS ============

const setTool = (toolId: string) => {
  activeTool.value = toolId as any;
  userPreferences.value.defaultTool = toolId;
};

const zoomIn = () => {
  zoom.value = Math.min(zoom.value + 25, 400);
};

const zoomOut = () => {
  zoom.value = Math.max(zoom.value - 25, 25);
};

const resetZoom = () => {
  zoom.value = 100;
};

const rotate = (degrees: number) => {
  rotation.value = (rotation.value + degrees) % 360;
};

const flip = (direction: 'horizontal' | 'vertical') => {
  if (direction === 'horizontal') {
    flipH.value = !flipH.value;
  } else {
    flipV.value = !flipV.value;
  }
};

const applyPreset = (preset: { center: number; width: number }) => {
  windowCenter.value = preset.center;
  windowWidth.value = preset.width;
};

const nextImage = () => {
  if (currentImageIndex.value < totalImages.value - 1) {
    currentImageIndex.value++;
  }
};

const prevImage = () => {
  if (currentImageIndex.value > 0) {
    currentImageIndex.value--;
  }
};

const togglePlay = () => {
  isPlaying.value = !isPlaying.value;
};

// Handle mouse movement for window/level tool
const handleMouseMove = useDebounceFn((e: MouseEvent) => {
  if (!isMouseOverViewer.value || activeTool.value !== 'windowLevel') return;
  
  // Calculate delta for window/level adjustment
  const delta = e.movementX || 0;
  windowWidth.value = Math.max(1, windowWidth.value + delta * 2);
}, 16); // ~60fps

// Initialize
onMounted(() => {
  // Simulate loading (in production this would load from Orthanc)
  setTimeout(() => {
    // Placeholder images
    images.value = Array.from({ length: 120 }, (_, i) => ({
      id: i + 1,
      instanceNumber: i + 1,
    }));
    isLoading.value = false;
    isLoaded.value = true;
  }, 1000);
});

// Watch for viewport size changes
watch([viewerWidth, viewerHeight], () => {
  debouncedAutoSave();
});
</script>

<template>
  <div class="h-full flex flex-col bg-gray-900 rounded-lg overflow-hidden">
    <!-- Toolbar -->
    <div class="bg-gray-800 px-4 py-2 flex items-center gap-4">
      <!-- Tool buttons -->
      <div class="flex items-center gap-1">
        <button
          v-for="tool in tools"
          :key="tool.id"
          @click="setTool(tool.id)"
          :title="`${tool.label} (${tool.shortcut})`"
          :class="[
            'p-2 rounded transition-colors',
            activeTool === tool.id 
              ? 'bg-blue-600 text-white' 
              : 'text-gray-300 hover:bg-gray-700'
          ]"
        >
          <component :is="tool.icon" class="w-5 h-5" />
        </button>
      </div>
      
      <div class="w-px h-8 bg-gray-600"></div>
      
      <!-- Zoom controls -->
      <div class="flex items-center gap-2">
        <button
          @click="zoomOut"
          class="p-2 text-gray-300 hover:bg-gray-700 rounded"
          title="Zoom Out"
        >
          <ZoomOut class="w-5 h-5" />
        </button>
        <span class="text-sm text-gray-300 min-w-12 text-center">{{ zoom }}%</span>
        <button
          @click="zoomIn"
          class="p-2 text-gray-300 hover:bg-gray-700 rounded"
          title="Zoom In"
        >
          <ZoomIn class="w-5 h-5" />
        </button>
        <button
          @click="resetZoom"
          class="p-2 text-gray-300 hover:bg-gray-700 rounded"
          title="Reset"
        >
          <Maximize2 class="w-5 h-5" />
        </button>
      </div>
      
      <div class="w-px h-8 bg-gray-600"></div>
      
      <!-- Rotation -->
      <div class="flex items-center gap-1">
        <button
          @click="rotate(-90)"
          class="p-2 text-gray-300 hover:bg-gray-700 rounded"
          title="Rotate Left"
        >
          <RotateCw class="w-5 h-5" />
        </button>
        <button
          @click="rotate(90)"
          class="p-2 text-gray-300 hover:bg-gray-700 rounded"
          title="Rotate Right"
        >
          <RotateCw class="w-5 h-5 rotate-180" />
        </button>
        <button
          @click="flip('horizontal')"
          :class="[
            'p-2 rounded',
            flipH ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
          ]"
          title="Flip Horizontal"
        >
          <FlipHorizontal class="w-5 h-5" />
        </button>
        <button
          @click="flip('vertical')"
          :class="[
            'p-2 rounded',
            flipV ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
          ]"
          title="Flip Vertical"
        >
          <FlipVertical class="w-5 h-5" />
        </button>
      </div>
      
      <div class="w-px h-8 bg-gray-600"></div>
      
      <!-- Playback -->
      <button
        @click="togglePlay"
        class="p-2 text-gray-300 hover:bg-gray-700 rounded"
        :title="isPlaying ? 'Pause' : 'Play'"
      >
        <Play v-if="!isPlaying" class="w-5 h-5" />
        <Pause v-else class="w-5 h-5" />
      </button>
      
      <div class="flex-1"></div>
      
      <!-- Window/Level presets -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-400">Preset:</span>
        <select
          v-for="(preset, index) in wlPresets"
          :key="index"
          @change="applyPreset(preset)"
          class="bg-gray-700 text-gray-300 text-sm px-2 py-1 rounded border-none cursor-pointer"
        >
          {{ preset.label }}
        </select>
      </div>
    </div>
    
    <!-- Main viewport -->
    <div 
      ref="viewerContainer"
      class="flex-1 relative flex items-center justify-center overflow-hidden"
      @mouseenter="isMouseOverViewer = true"
      @mouseleave="isMouseOverViewer = false"
      @mousemove="handleMouseMove"
    >
      <!-- Loading state -->
      <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-gray-900">
        <div class="text-center">
          <Loader2 class="w-12 h-12 text-blue-500 animate-spin mx-auto" />
          <p class="mt-4 text-gray-400">Loading DICOM images...</p>
        </div>
      </div>
      
      <!-- Error state -->
      <div v-else-if="error" class="absolute inset-0 flex items-center justify-center bg-gray-900">
        <div class="text-center text-red-400">
          <Image class="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>{{ error }}</p>
        </div>
      </div>
      
      <!-- Image display (placeholder) -->
      <div 
        v-else
        class="relative"
        :style="{
          transform: `scale(${zoom / 100}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
          transition: 'transform 0.2s ease'
        }"
      >
        <div 
          class="w-[512px] h-[512px] bg-black flex items-center justify-center border-2 border-gray-700"
          :class="{ 'cursor-move': activeTool === 'pan', 'cursor-crosshair': activeTool === 'windowLevel' || activeTool === 'measure' }"
        >
          <div class="text-center text-gray-500">
            <Image class="w-24 h-24 mx-auto mb-4 opacity-30" />
            <p>DICOM Image Viewport</p>
            <p class="text-sm mt-2">{{ currentImageIndex + 1 }} / {{ totalImages }}</p>
            <p class="text-xs mt-4 opacity-50">
              Window: {{ windowCenter }} | Level: {{ windowWidth }}
            </p>
            <!-- Mouse position indicator -->
            <p v-if="isMouseOverViewer" class="text-xs mt-2 text-blue-400">
              Mouse: {{ Math.round(mouseX) }}, {{ Math.round(mouseY) }}
            </p>
          </div>
        </div>
      </div>
      
      <!-- Image navigation -->
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4">
        <button
          @click="prevImage"
          :disabled="currentImageIndex === 0"
          class="px-3 py-1 bg-gray-800 text-gray-300 rounded disabled:opacity-50"
        >
          Previous
        </button>
        <span class="text-gray-300 text-sm">
          {{ currentImageIndex + 1 }} / {{ totalImages }}
        </span>
        <button
          @click="nextImage"
          :disabled="currentImageIndex >= totalImages - 1"
          class="px-3 py-1 bg-gray-800 text-gray-300 rounded disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
    
    <!-- Status bar -->
    <div class="bg-gray-800 px-4 py-1 flex items-center justify-between text-xs text-gray-400">
      <div class="flex items-center gap-4">
        <span>Study: {{ studyId || 'N/A' }}</span>
        <span>Zoom: {{ zoom }}%</span>
        <span>Rotation: {{ rotation }}°</span>
        <span v-if="isMobile" class="text-blue-400">Mobile</span>
        <span v-else-if="isTablet" class="text-blue-400">Tablet</span>
      </div>
      <div class="flex items-center gap-4">
        <span>WC: {{ windowCenter }}</span>
        <span>WW: {{ windowWidth }}</span>
        <span>Viewport: {{ Math.round(viewerWidth) }}x{{ Math.round(viewerHeight) }}</span>
      </div>
    </div>
  </div>
</template>
