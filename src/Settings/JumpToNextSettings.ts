import Checkboxes from '../Components/Checkboxes.svelte';
import type BCPlugin from '../main';
import { getFields } from '../Utils/HierUtils';
import { subDetails } from './details';

export function addJumpToNextSettings(
  plugin: BCPlugin,
  viewDetails: HTMLDetailsElement,
) {
  const { settings } = plugin;
  const jumpToDirDetails = subDetails('Jump to Next Direction', viewDetails);

  jumpToDirDetails.createDiv({ cls: 'setting-item-name', text: 'Limit which fields to jump to' });

  new Checkboxes({
    target: jumpToDirDetails,
    props: {
      plugin,
      settingName: 'limitJumpToFirstFields',
      options: getFields(settings.userHiers),
    },
  });
}
