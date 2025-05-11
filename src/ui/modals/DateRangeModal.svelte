<script lang="ts">
  import SveltyPicker from "svelty-picker";

  interface Props {
    value: string[] | undefined;

    onClose: (value: string | string[] | null) => void;
  }

  let { value, onClose }: Props = $props();

</script>

<div class="criticmarkup-daterange-picker">
  <SveltyPicker
    pickerOnly
    isRange
    autocommit={false}
    mode="datetime"
    value={value}
    format="yyyy-mm-dd hh:ii:00"
    onBlur={() => onClose(null)}
    onChange={(e) => onClose(e)}
  />
</div>
