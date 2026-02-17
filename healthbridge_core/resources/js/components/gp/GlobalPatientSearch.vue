<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';

interface Patient {
    id: number;
    cpt: string;
    couch_id: string;
    full_name: string;
    age: number;
    gender: string;
    phone?: string;
    visit_count: number;
}

interface Props {
    placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
    placeholder: 'Search by name, CPT, or phone...',
});

const emit = defineEmits<{
    (e: 'select', patient: Patient): void;
}>();

const searchQuery = ref('');
const searchResults = ref<Patient[]>([]);
const isOpen = ref(false);
const isLoading = ref(false);
const selectedIndex = ref(0);

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>;

watch(searchQuery, async (query) => {
    clearTimeout(searchTimeout);
    
    if (query.length < 2) {
        searchResults.value = [];
        isOpen.value = false;
        return;
    }

    searchTimeout = setTimeout(async () => {
        isLoading.value = true;
        isOpen.value = true;
        
        try {
            const response = await axios.get('/gp/patients/search', {
                params: { q: query }
            });
            searchResults.value = response.data.patients || [];
        } catch (error) {
            console.error('Search failed:', error);
            searchResults.value = [];
        } finally {
            isLoading.value = false;
        }
    }, 300);
});

// Handle selection
const handleSelect = (patient: Patient) => {
    emit('select', patient);
    searchQuery.value = '';
    searchResults.value = [];
    isOpen.value = false;
};

// Handle keyboard navigation
const handleKeydown = (event: KeyboardEvent) => {
    if (!isOpen.value || searchResults.value.length === 0) return;

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectedIndex.value = Math.min(selectedIndex.value + 1, searchResults.value.length - 1);
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
    } else if (event.key === 'Enter') {
        event.preventDefault();
        if (searchResults.value[selectedIndex.value]) {
            handleSelect(searchResults.value[selectedIndex.value]);
        }
    } else if (event.key === 'Escape') {
        isOpen.value = false;
    }
};

// Handle blur
const handleBlur = () => {
    // Delay to allow click events on items
    setTimeout(() => {
        isOpen.value = false;
    }, 200);
};

// Handle focus
const handleFocus = () => {
    if (searchQuery.value.length >= 2 && searchResults.value.length > 0) {
        isOpen.value = true;
    }
};
</script>

<template>
    <div class="relative">
        <Command class="rounded-lg border shadow-sm">
            <CommandInput
                v-model="searchQuery"
                :placeholder="placeholder"
                @keydown="handleKeydown"
                @blur="handleBlur"
                @focus="handleFocus"
            />
            <CommandList v-if="isOpen" class="absolute top-full left-0 right-0 z-50 mt-1 bg-background border rounded-lg shadow-lg max-h-80 overflow-auto">
                <CommandEmpty v-if="!isLoading && searchResults.length === 0" class="py-6 text-center text-sm">
                    No patients found.
                </CommandEmpty>
                
                <div v-if="isLoading" class="py-6 text-center text-sm text-muted-foreground">
                    <div class="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                    Searching...
                </div>

                <CommandGroup v-if="!isLoading && searchResults.length > 0" heading="Patients">
                    <CommandItem
                        v-for="(patient, index) in searchResults"
                        :key="patient.cpt"
                        :value="patient.full_name"
                        :class="[
                            'flex items-center justify-between px-3 py-2 cursor-pointer',
                            index === selectedIndex ? 'bg-accent' : ''
                        ]"
                        @select="handleSelect(patient)"
                    >
                        <div class="flex items-center gap-3">
                            <div class="flex-shrink-0">
                                <div class="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                                    {{ patient.full_name.charAt(0) }}
                                </div>
                            </div>
                            <div>
                                <div class="font-medium">{{ patient.full_name }}</div>
                                <div class="text-xs text-muted-foreground">
                                    {{ patient.age }}y • {{ patient.gender }} • {{ patient.cpt }}
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <Badge v-if="patient.visit_count > 1" variant="secondary" class="text-xs">
                                {{ patient.visit_count }} visits
                            </Badge>
                            <svg class="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </Command>
    </div>
</template>
