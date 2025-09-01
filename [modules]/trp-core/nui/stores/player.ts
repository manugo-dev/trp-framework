import { defineStore } from "@trp/nui/pinia";
import { computed, ref } from "@trp/nui/vue";

export const usePlayerStore = defineStore("player", () => {
	const playerData = ref<object | null>(null);
	const isLogged = computed(() => !!playerData.value);

	function updatePlayer(data: object) {
		playerData.value = data;
	}

	return {
		playerData,
		isLogged,
		updatePlayer,
	};
});
