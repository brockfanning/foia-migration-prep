<?php
// This is a Drupal script for pubishing cleared reports.
$number_to_publish = 40;
$query = \Drupal::database()->select('content_moderation_state_field_data', 'ms');
$query->join('node_field_revision', 'nf', 'nf.nid=ms.content_entity_id AND nf.vid=ms.content_entity_revision_id AND nf.langcode=ms.langcode');
$query->fields('ms');
$query->condition('ms.moderation_state','cleared');
$query->range(0, $number_to_publish);
$results = $query->execute()->fetchAllAssoc('content_entity_id');
$nids = array_keys($results);
foreach ($nids as $nid) {
    $node = node_load($nid);
    $node->setPublished(TRUE);
    $node->set('moderation_state', 'published');
    $node->save();
    print('Saved node ' . $nid . ' - ' . $node->getTitle()) . PHP_EOL;
}
