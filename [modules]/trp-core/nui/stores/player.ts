import { computed, defineStore, ref } from "@trp/nui";

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
